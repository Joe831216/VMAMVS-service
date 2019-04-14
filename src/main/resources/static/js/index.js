const NOTI_LEVEL_INFO = "info";
const NOTI_LEVEL_WARNING = "warning";
const NOTI_LEVEL_ERROR = "error";

let toast = $("#toast-div .toast");
let notificationsDropdown = $("#notificationsMenuLink").parent().find(".dropdown-menu");
let stompClient = null;

$(document).ready( function () {
    fetch("/web-page/system-names")
        .then(response => response.json())
        .then(systems => {
            let menu = $("#systemsDropdownMenu");
            Object.values(systems).forEach(systemName => {
                let sysButton = $("<button></button>")
                    .attr("class", "dropdown-item")
                    .attr("value", systemName)
                    .attr("onclick", "startGraph(this)")
                    .append(systemName);
                menu.append(sysButton);
            });
        });
        connectSocket();
});

function connectSocket() {
    let socket = new SockJS("/mgp-websocket");
    stompClient = Stomp.over(socket);
    stompClient.connect({}, function (frame) {
        toast.find(".toast-header")
            .attr("class", "toast-header text-white bg-primary")
            .prepend("<i class='fas fa-info-circle mr-2'></i>");
        toast.find("strong").empty().append("Connected");
        toast.find(".toast-body").empty().append("Successfully connected to the MGP service!");
        toast.toast('show');
        console.log("Connected: " + frame);
    });
}

let subscribeGraph = null;
let subscribeNotify = null;
let graph = null;
function startGraph(systemName) {
    $("#systemsDropdownMenuButton")
        .text(systemName.value);

    $("#system-options-menu-button").prop("disabled", false);

    $("#systemsDropdownMenu button.active")
        .removeClass("active")
        .css("pointer-events", "auto");

    $(systemName).addClass("active")
        .css("pointer-events", "none");

    // If graph exist, unsubscribe and clear graph.
    if (subscribeGraph !== null && graph !== null) {
        subscribeGraph.unsubscribe();
        graph.closeNodeCard();
        graph = null;
        $("#graph g").remove();
    }

    if (subscribeNotify !== null) {
        subscribeNotify.unsubscribe();
    }

    // Subscribe graph topic
    subscribeGraph = stompClient.subscribe("/topic/graph/" + systemName.value, function (message) {
        let data = JSON.parse(message.body);
        if (graph === null) {
            graph = new BuildGraph(data);
        } else {
            graph.updateData(data);
        }
    });

    let notificationCount = 0;

    function createNotificationDropdownItem(notification) {
        let headerClass = "toast-header ";
        let icon;
        if (notification.level === NOTI_LEVEL_INFO) {
            headerClass += "text-white bg-primary";
            icon = "<i class='fas fa-info-circle mr-2'></i>";
        } else if (notification.level === NOTI_LEVEL_WARNING) {
            headerClass += "text-white bg-warning";
            icon = "<i class='fas fa-exclamation-triangle mr-2'></i>";
        } else if (notification.level === NOTI_LEVEL_ERROR) {
            headerClass += "text-white bg-danger";
            icon = "<i class='fas fa-bug mr-2'></i>";
        }

        return "<button class='dropdown-item'>" +
            "<div class='toast show'>" +
            "<div class='" + headerClass + "'>" +
            icon +
            "<strong class='mr-auto'>" + notification.title + "</strong>" +
            "<small>" + notification.dateTime + "</small>" +
            "</div>" +
            "<div class='toast-body'>" + notification.content + "</div>" +
            "</div>" +
            "</button>";
    }

    function removeNotificationDropdownItem() {
        if (notificationCount > 100) {
            notificationsDropdown.find(".dropdown-item:gt(99)").remove();
        }
    }

    // Fetch current system notifications
    fetch("/web-page/notification/" + systemName.value)
        .then(response => response.json())
        .then(notifications => {
            notificationCount += notifications.length;
            notificationsDropdown.empty();
            notifications.forEach(notification => {
                let item = $(createNotificationDropdownItem(notification));
                if (notification.appName && notification.version) {
                    item.click(function () {
                        graph.clickNodeByNameAndVersion(notification.appName, notification.version)
                    });
                }
                notificationsDropdown.append(item);
            });
        });

    // Subscribe notification topic
    subscribeNotify = stompClient.subscribe("/topic/notification/" + systemName.value, function (message) {
        let data = JSON.parse(message.body);
        toast.find("i").remove();
        if (data.level === NOTI_LEVEL_INFO) {
            toast.find(".toast-header")
                .attr("class", "toast-header text-white bg-primary")
                .prepend("<i class='fas fa-info-circle mr-2'></i>");
        } else if (data.level === NOTI_LEVEL_WARNING) {
            toast.find(".toast-header")
                .attr("class", "toast-header text-white bg-warning")
                .prepend("<i class='fas fa-exclamation-triangle mr-2'></i>");
        } else if (data.level === NOTI_LEVEL_ERROR) {
            toast.find(".toast-header")
                .attr("class", "toast-header text-white bg-danger")
                .prepend("<i class='fas fa-bug mr-2'></i>");
        }
        toast.find("strong").empty().append(data.title);
        toast.find(".toast-body").empty().append(data.content);
        toast.toast('show');

        notificationCount++;
        let item = $(createNotificationDropdownItem(data));
        if (data.appName && data.version) {
            item.click(function () {
                graph.clickNodeByNameAndVersion(data.appName, data.version)
            });
        }
        notificationsDropdown.prepend(item);
        removeNotificationDropdownItem();
    });

    stompClient.send("/mgp/graph/" + systemName.value);
}

