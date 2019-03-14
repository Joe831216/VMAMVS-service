const LABEL_SERVICE = "Microservice";
const LABEL_NULLSERVICE = "NullMicroservice";
const LABEL_ENDPOINT = "Endpoint";
const LABEL_NULLENDPOINT = "NullEndpoint";

const REL_OWN = "OWN";
const REL_HTTPREQUEST = "HTTP_REQUEST";

let canvas, graph, body, svg;
let graphWidth, graphHeight;

function init() {
    canvas = document.getElementById("canvas");

    graph = document.getElementById("graph");
    graph.setAttribute("width", canvas.clientWidth);
    graph.setAttribute("height", canvas.clientHeight);
	//graph.setAttribute("width", window.innerWidth);
	//graph.setAttribute("height", window.innerHeight);

    body = document.body;
    body.setAttribute("height", canvas.clientHeight);

    svg = d3.select("svg");

    graphWidth = +svg.attr("width");
    graphHeight = +svg.attr("height");
}

function resize() {
    graph.setAttribute("width", canvas.clientWidth);
    graph.setAttribute("height", canvas.clientHeight);
    graphWidth = svg.attr("width"),
    graphHeight = svg.attr("height");
}

function buildGraph(data) {

    const SIZE_SERVIVE = 4500;
    const SIZE_ENDPOINT = 1500;

    let g = svg.append("g");

    let color = d3.scaleOrdinal(d3.schemeSet2);

    let zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .on("zoom", zoomed);

    svg.call(zoom)

    let link = g.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(data.links)
        .enter().append("line")
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round")
        .attr("marker-end", d => {
            if (d.type === REL_OWN) {
                return null;
            } else if (d.type === REL_HTTPREQUEST) {
                return "url(#arrow-m)";
            }
        });
	
	let node = g.append("g")
			.attr("class", "nodes")
		.selectAll("path")
		.data(data.nodes)
		.enter().append("path")
			.attr("d", d3.symbol()
				.size(d => {
					if(d.labels.includes(LABEL_SERVICE)) {
						d.radius = SIZE_SERVIVE / 100;
						return SIZE_SERVIVE;
					} else if(d.labels.includes(LABEL_ENDPOINT)) {
						d.radius = SIZE_ENDPOINT / 100;
						return SIZE_ENDPOINT;
					}
				})
				.type((d, i) => {
					if (d.labels.includes(LABEL_SERVICE)) {
						return d3.symbolSquare;
					} else if(d.labels.includes(LABEL_ENDPOINT)){
						return d3.symbolCircle;
					}
				})
			)
			.attr("fill", d => {
				if (d.labels.includes(LABEL_NULLSERVICE) || d.labels.includes(LABEL_NULLENDPOINT)) {
					return "#3a3a3a";
				} else {
                    return color(d.appName);
				}
            })
			.attr("stroke", "#fff")
			.attr("stroke-width", "1.5px")
			.on("mouseover", mouseover)
			.on("mouseout", mouseout)
			.on("click", clicked)
			.call(d3.drag()
				.on("start", dragstarted)
				.on("drag", dragged)
				.on("end", dragended));

		
	node.append("title")
		.text(d => {
            if (d.labels.includes(LABEL_SERVICE)) {
            	return d.appId;
			} else if (d.labels.includes(LABEL_ENDPOINT)) {
            	return d.endpointId;
			}
		});
	
	let nodelabel = g.append("g")
				.attr("class", "labels")
			.selectAll("g")
			.data(data.nodes)
			.enter().append("g")
			.on("click", clicked)
			.call(d3.drag()
				.on("start", dragstarted)
				.on("drag", dragged)
				.on("end", dragended));

		nodelabel.append("rect")
			.attr("fill", "#ddd")
			.attr("fill-opacity", 0.5)
			.attr("rx", 8)
			.attr("ry", 8);

		nodelabel.append("text")
			.attr("dx", 0)
			.attr("dy", d => {
				if (d.labels.includes(LABEL_SERVICE)) {
					return 53;
				} else if (d.labels.includes(LABEL_ENDPOINT)) {
					return 39;
				}
			})
			.text(d => {
				if (d.labels.includes(LABEL_SERVICE)) {
					return d.appName + ":" + d.version;
				} else if (d.labels.includes(LABEL_ENDPOINT)) {
					return "[" + d.method + "] " + d.path;
				}
			});

		nodelabel.selectAll("rect")
			.attr("width", function() {
				return (d3.select(this.parentNode).select("text").node().getBBox().width + 8);
			})
			.attr("height", "16px")
			.attr("x", function() {
				return (d3.select(this.parentNode).select("text").node().getBBox().width + 8) / -2;
			}).attr("y", d => {
			if (d.labels.includes(LABEL_SERVICE)) {
				return 40;
			} else if (d.labels.includes(LABEL_ENDPOINT)) {
				return 28;
			}
		});

		let nullNodeLabel = nodelabel.filter(d => {
            return d.labels.includes(LABEL_NULLSERVICE) || d.labels.includes(LABEL_NULLENDPOINT);
        });

			nullNodeLabel.append("rect")
				.attr("class", "null-label")
				.attr("fill", "#ddd")
				.attr("fill-opacity", 0.5)
				.attr("rx", 8)
				.attr("ry", 8);

			nullNodeLabel.append("text")
				.attr("class", "null-label")
				.attr("dx", 0)
				.attr("dy", function (d) {
                    let texts = $(this.parentNode).find("text");
                    let position = texts.length - 1;
					if (d.labels.includes(LABEL_SERVICE)) {
						return 52 + position * 20;
					} else if (d.labels.includes(LABEL_ENDPOINT)) {
						return 39 + position * 20;
					}
				})
				.style("fill", "#ce0000")
				.text("<<Null>>");

			nullNodeLabel.selectAll("rect.null-label")
				.attr("width", function() {
					let text = d3.select(this.parentNode).select("text.null-label").node();
					return (text.getBBox().width + 8);
				})
				.attr("height", "16px")
				.attr("x", function() {
                    let text = d3.select(this.parentNode).select("text.null-label").node();
                    return (text.getBBox().width + 8) / -2;
				})
				.attr("y", function (d) {
                	let texts = $(this.parentNode).find("text");
                    let position;
					for (position = 0; position < texts.length; position++) {
                        if (texts[position].textContent === "<<Null>>") {
                            break;
                        }
					}
					if (d.labels.includes(LABEL_SERVICE)) {
						return 40 + position * 20;
					} else if (d.labels.includes(LABEL_ENDPOINT)) {
						return 27 + position * 20;
					}
				});

    let simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links)
            .id(d => d.id )
			.distance(170)
			.strength(1.5))
        .force("charge", d3.forceManyBody()
			.strength(300))
        .force("center", d3.forceCenter(graphWidth / 2, graphHeight / 2))
        .force("collision", d3.forceCollide().radius(85))
		.on("tick", ticked);

	function ticked(d) {
		link
			.attr("x1", d => { return d.source.x; })
			.attr("y1", d => { return d.source.y; })
			.attr("x2", d => { return d.target.x; })
			.attr("y2", d => { return d.target.y; });

		node
			.attr("transform", d => { 
				return "translate(" + d.x + "," + d.y + ")";
			});
			//.attr("cx", function(d) { return d.x; })
			//.attr("cy", function(d) { return d.y; });
		
		nodelabel
			.attr("transform", d => { return "translate(" + d.x + "," + d.y + ")"; });
			//.attr("x", d => { return d.x; })
			//.attr("y", d => { return d.y; });
    }	
    
    function clicked(d) {
        let scale = 1.5;
        let translate = [graphWidth / 2 - scale * d.x, graphHeight / 2 - scale * d.y];
        let transform = d3.zoomIdentity
            .translate(translate[0], translate[1])
            .scale(scale);
    
        svg.transition()
            .duration(600)
            .call(zoom.transform, transform);
    
        initNodeCard(d);
    }
    
    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    
    function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }
    
    function dragended(d) {
        d.fx = null;
        d.fy = null;
    }
    
    function mouseover(d, i) {
        d3.select(this)
            .attr("d", d3.symbol()
                .size(d => {
                    if(d.labels.includes(LABEL_SERVICE)) {
                        return SIZE_SERVIVE*1.2;
                    } else if(d.labels.includes(LABEL_ENDPOINT)){
                        return SIZE_ENDPOINT*1.2;
                    }
                })
                .type((d, i) => {
                    if (d.labels.includes(LABEL_SERVICE)) {
						return d3.symbolSquare;
					} else if(d.labels.includes(LABEL_ENDPOINT)){
						return d3.symbolCircle;
					}
                })
            )
            .attr("fill-opacity", 0.8);
    }
    
    function mouseout(d, i) {
        d3.select(this)
            .attr("d", d3.symbol()
                .size(d => {
                    if(d.labels.includes(LABEL_SERVICE)) {
                        return SIZE_SERVIVE;
                    } else if(d.labels.includes(LABEL_ENDPOINT)){
                        return SIZE_ENDPOINT;
                    }
                })
                .type((d, i) => {
                    if (d.labels.includes(LABEL_SERVICE)) {
                        return d3.symbolSquare;
                    } else if(d.labels.includes(LABEL_ENDPOINT)){
                        return d3.symbolCircle;
                    }
                })
            )
            .attr("fill-opacity", 1);
    }
    
    function zoomed() {
        let transform = d3.event.transform;
        g.attr("transform", transform);
    }

    function getNodeById(id) {
		data.nodes.forEach((node => {
			if (node.id === id) {
				return node;
			}
		}));
    }
    
}

function initNodeCard(d) {
	let card = document.getElementById("node-card");
	let cardHeader = card.getElementsByClassName("card-header")[0];
	let cardClose = cardHeader.getElementsByClassName("close")[0];
	let cardHeaderTitle = cardHeader.getElementsByClassName("card-title")[0];
	let nodeInfoBody = document.getElementById("node-infomation").getElementsByClassName("card-body")[0];
	let nodeInfoTitle = nodeInfoBody.getElementsByClassName("card-title")[0];
	let nodeMonitorBody = document.getElementById("node-monitor").getElementsByClassName("card-body")[0];
	let nodeMonitorTitle = nodeMonitorBody.getElementsByClassName("card-title")[0];

	cardClose.addEventListener("click", function() {
		cardHeader.classList.remove("show");
		nodeInfoBody.classList.remove("show");
		nodeMonitorBody.classList.remove("show");
		card.classList.remove("show");
	});
	
	// Card header
	if (d.labels.includes(LABEL_ENDPOINT)) {
		cardHeaderTitle.innerHTML = "[" + d.method + "] " + d.path;
	} else if (d.labels.includes(LABEL_SERVICE)) {
		cardHeaderTitle.innerHTML = d.appName;
	}
	
	// Node info
	if (d.labels.includes(LABEL_ENDPOINT)) {
		nodeInfoTitle.innerHTML = "";
	} else if (d.labels.includes(LABEL_SERVICE)) {
		nodeInfoTitle.innerHTML = d.version;
	}
	
	//nodeMonitorTitle.innerHTML = d.group;

	if (!card.classList.contains("show")) {
		cardHeader.classList.add("show");
		nodeInfoBody.classList.add("show");
		nodeMonitorBody.classList.add("show");
		card.classList.add("show");
	}

	fetch(d.url + "/health")
	.then(response => response.json())
	.then(json => {
		/*
		var node = document.createElement("pre");
		node.id = "health-json"
		nodeMonitorBody.appendChild(node);
		*/
		$("#health-json").empty();
		$("#health-json").jsonViewer(json, {collapsed: true, withQuotes: false});
	});

	fetch(d.url + "/metrics")
	.then(response => response.json())
	.then(json => {
		$("#metrics-json").empty();
		$("#metrics-json").jsonViewer(json, {collapsed: true, withQuotes: false});
	});
}

window.addEventListener("load", init);
window.addEventListener("resize", resize);