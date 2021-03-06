package com.soselab.microservicegraphplatform.services;

import com.soselab.microservicegraphplatform.bean.elasticsearch.MgpLog;
import com.soselab.microservicegraphplatform.bean.mgp.AppMetrics;
import com.soselab.microservicegraphplatform.bean.mgp.WebNotification;
import com.soselab.microservicegraphplatform.bean.mgp.monitor.SpcData;
import com.soselab.microservicegraphplatform.bean.mgp.notification.warning.*;
import com.soselab.microservicegraphplatform.bean.neo4j.Service;
import com.soselab.microservicegraphplatform.bean.neo4j.Setting;
import com.soselab.microservicegraphplatform.controllers.WebPageController;
import com.soselab.microservicegraphplatform.repositories.neo4j.GeneralRepository;
import com.soselab.microservicegraphplatform.repositories.neo4j.ServiceRepository;
import org.apache.commons.lang3.tuple.ImmutablePair;
import org.apache.commons.lang3.tuple.Pair;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;

import java.text.SimpleDateFormat;
import java.util.*;

@Configuration
public class MonitorService {
    private static final Logger logger = LoggerFactory.getLogger(MonitorService.class);
    private static final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");

    @Autowired
    private GeneralRepository generalRepository;
    @Autowired
    private ServiceRepository serviceRepository;
    @Autowired
    private LogAnalyzer logAnalyzer;
    @Autowired
    private RestInfoAnalyzer restInfoAnalyzer;
    @Autowired
    private WebPageController webPageController;
    @Autowired
    private WebNotificationService notificationService;
    private Map<String, SpcData> failureStatusRateSPCMap = new HashMap<>();
    private Map<String, SpcData> averageDurationSPCMap = new HashMap<>();

    @Scheduled(cron = "0 0 3 1/1 * ?")
    private void everyDayScheduled() {
        List<String> systemNames = generalRepository.getAllSystemName();
        for (String systemName : systemNames) {
            List<Service> services = serviceRepository.findBySystemNameWithOptionalSettingNotNull(systemName);
            checkLowUsageVersionAlert(systemName, services, 1440);
        }
        logger.info("Daily scheduled executed");
    }

    public void runScheduled(String systemName) {
        List<Service> services = serviceRepository.findBySystemNameWithOptionalSettingNotNull(systemName);
        updateSPCData(systemName, services);
        checkUserAlert(systemName, services);
        checkSPCAlert(systemName);
    }

    public void checkUserAlert(String systemName, List<Service> services) {
        for (Service service : services) {
            Setting setting = service.getSetting();
            if (setting == null) {
                continue;
            }
            // Using log (Elasticsearch) metrics
            if (setting.getEnableLogFailureAlert() || setting.getEnableLogAverageDurationAlert()) {
                AppMetrics metrics = logAnalyzer.getMetrics(service.getSystemName(), service.getAppName(), service.getVersion());
                if (setting.getEnableLogFailureAlert()) {
                    // Failure status rate
                    Pair<Boolean, Float> failureStatusRateResult = isFailureStatusRateExceededThreshold
                            (metrics, setting.getFailureStatusRate());
                    if (failureStatusRateResult.getKey()) {
                        WebNotification notification = new FailureStatusRateWarningNotification(service.getAppName(),
                                service.getVersion(), failureStatusRateResult.getValue(), setting.getFailureStatusRate(),
                                FailureStatusRateWarningNotification.DATA_ELASTICSEARCH, FailureStatusRateWarningNotification.THRESHOLD_USER);
                        notificationService.pushNotificationToSystem(systemName, notification);
                    }
                    // Error
                    if (setting.getFailureErrorCount() != null && metrics.getErrorCount() > setting.getFailureErrorCount()) {
                        WebNotification notification = new FailureErrorNotification(service.getAppName(), service.getVersion(),
                                metrics.getErrorCount(), setting.getFailureErrorCount(), FailureErrorNotification.TYPE_ELASTICSEARCH);
                        notificationService.pushNotificationToSystem(systemName, notification);
                        logger.info("Found service " + service.getAppId() + " exception: error count = " +
                                metrics.getErrorCount() + " (threshold = " + setting.getFailureErrorCount() + ")");
                    }
                }
                if (setting.getEnableLogAverageDurationAlert()) {
                    if (setting.getThresholdAverageDuration() != null && metrics.getAverageDuration() > setting.getThresholdAverageDuration()) {
                        WebNotification notification = new HighAvgDurationNotification(service.getAppName(), service.getVersion(),
                                metrics.getAverageDuration(), setting.getThresholdAverageDuration(), HighAvgDurationNotification.DATA_ELASTICSEARCH);
                        notificationService.pushNotificationToSystem(systemName, notification);
                    }
                }
            }
            // Using rest (Spring Actuator) metrics
            if (setting.getEnableRestFailureAlert() || setting.getEnableRestAverageDurationAlert()) {
                AppMetrics metrics = restInfoAnalyzer.getMetrics(service.getSystemName(), service.getAppName(), service.getVersion());
                // Failure status rate
                if (setting.getEnableRestFailureAlert()) {
                    Pair<Boolean, Float> failureStatusRateResult = isFailureStatusRateExceededThreshold
                            (metrics, setting.getFailureStatusRate());
                    if (failureStatusRateResult.getKey()) {
                        WebNotification notification = new FailureStatusRateWarningNotification(service.getAppName(),
                                service.getVersion(), failureStatusRateResult.getValue(), setting.getFailureStatusRate(),
                                FailureStatusRateWarningNotification.DATA_ACTUATOR, FailureStatusRateWarningNotification.THRESHOLD_USER);
                        notificationService.pushNotificationToSystem(systemName, notification);
                    }
                }
                if (setting.getEnableRestAverageDurationAlert()) {
                    if (setting.getThresholdAverageDuration() != null && metrics.getAverageDuration() > setting.getThresholdAverageDuration()) {
                        WebNotification notification = new HighAvgDurationNotification(service.getAppName(), service.getVersion(),
                                metrics.getAverageDuration(), setting.getThresholdAverageDuration(), HighAvgDurationNotification.DATA_ACTUATOR);
                        notificationService.pushNotificationToSystem(systemName, notification);
                    }
                }
            }
            // Using SPC
            if (setting.getEnableSPCHighDurationRateAlert()) {
                SpcData spcData = getAppDurationSPC(service.getAppId());
                int violationCount = 0;
                for (Map.Entry<String, Float> entry : spcData.getValues().entrySet()) {
                    if (entry.getValue() > spcData.getUcl()) {
                        violationCount++;
                    }
                }
                float highDurationRate = (float) violationCount / spcData.getValues().size();
                if (highDurationRate > setting.getThresholdSPCHighDurationRate()) {
                    WebNotification notification = new SpcHighDurationRateNotification(service.getAppName(), service.getVersion(),
                            highDurationRate, setting.getThresholdSPCHighDurationRate());
                    notificationService.pushNotificationToSystem(systemName, notification);
                }
            }
        }
    }

    // Pair<isExceededThreshold, failureStatusRate>
    private Pair<Boolean, Float> isFailureStatusRateExceededThreshold(AppMetrics metrics, float threshold) {
        float failureStatusRate = metrics.getFailureStatusRate();
        return new ImmutablePair<>(failureStatusRate > threshold, failureStatusRate);
    }

    // Follow codes are for SPC
    private float getPChartSD(float cl, float n) {
        return (float) Math.sqrt(cl*(1-cl)/n);
    }

    private float getUChartSD(float cl, float n) {
        return (float) Math.sqrt(cl/n);
    }

    private float getCChartSD(float cl) {
        return (float) Math.sqrt(cl);
    }

    private void checkSPCAlert(String systemName) {
        SpcData spcData = failureStatusRateSPCMap.get(systemName);
        if (spcData != null) {
            float ucl = spcData.getUcl();
            spcData.getValues().forEach((app, value) -> {
                if (value > ucl) {
                    String appName = app.split(":")[0];
                    String version = app.split(":")[1];
                    notificationService.pushNotificationToSystem(systemName, new FailureStatusRateWarningNotification(appName, version, value, ucl,
                            FailureStatusRateWarningNotification.DATA_ELASTICSEARCH, FailureStatusRateWarningNotification.THRESHOLD_SPC));
                }
            });
        }
    }

    private void updateSPCData(String systemName, List<Service> services) {
        Map<String, AppMetrics> metricsMap = new HashMap<>();
        for (Service service : services) {
            metricsMap.put(service.getAppName() + ":" + service.getVersion(), logAnalyzer.getMetrics(service.getSystemName(), service.getAppName(), service.getVersion()));
        }
        SpcData failureStatusRateSpcData = getNowFailureStatusRateSPC(metricsMap);
        webPageController.sendAppsFailureStatusRateSPC(systemName, failureStatusRateSpcData);
        failureStatusRateSPCMap.put(systemName, failureStatusRateSpcData);

        SpcData durationSpcData = getNowAverageDurationSPC(metricsMap);
        webPageController.sendAppsAverageDurationSPC(systemName, durationSpcData);
        averageDurationSPCMap.put(systemName, durationSpcData);

    }

    // P chart
    private SpcData getNowFailureStatusRateSPC(Map<String, AppMetrics> metricsMap) {
        float valueCount = 0;
        int sampleGroupsNum = 0;
        long samplesCount = 0;
        Map<String, Float> values = new HashMap<>();
        for (Map.Entry<String, AppMetrics> entry : metricsMap.entrySet()) {
            String app = entry.getKey();
            AppMetrics metrics = entry.getValue();
            int samplesNum = metrics.getFailureStatusSamplesNum();
            if (samplesNum > 0) {
                float value = metrics.getFailureStatusRate();
                valueCount += value;
                sampleGroupsNum ++;
                samplesCount += samplesNum;
                values.put(app, value);
            }
        }
        float cl = valueCount / sampleGroupsNum;
        float n = (float) samplesCount/sampleGroupsNum;
        float sd = getPChartSD(cl, n);
        float ucl = cl + 3*sd;
        float lcl = cl - 3*sd;
        if (lcl < 0) {
            lcl = 0;
        }
        return new SpcData(cl, ucl, lcl, values, "Failure Status Rate", "Services", new ArrayList<>(Collections.singletonList(SpcData.UCL)));
    }

    public SpcData getFailureStatusRateSPC(String systemName) {
        return failureStatusRateSPCMap.get(systemName);
    }

    // U chart
    private SpcData getNowAverageDurationSPC(Map<String, AppMetrics> metricsMap) {
        float valueCount = 0;
        int sampleGroupsNum = 0;
        long samplesCount = 0;
        Map<String, Float> values = new HashMap<>();
        for (Map.Entry<String, AppMetrics> entry : metricsMap.entrySet()) {
            String app = entry.getKey();
            AppMetrics metrics = entry.getValue();
            int samplesNum = metrics.getDurationSamplesNum();
            if (samplesNum > 0) {
                float value = metrics.getAverageDuration();
                valueCount += value;
                sampleGroupsNum ++;
                samplesCount += samplesNum;
                values.put(app, value);
            }
        }
        float cl = valueCount / sampleGroupsNum;
        float n = (float) samplesCount/sampleGroupsNum;
        float sd = getUChartSD(cl, n);
        float ucl = cl + 3*sd;
        float lcl = cl - 3*sd;
        if (lcl < 0) {
            lcl = 0;
        }
        return new SpcData(cl, ucl, lcl, values, "Average Duration", "Services", new ArrayList<>(Collections.singletonList(SpcData.UCL)));
    }

    public SpcData getAverageDurationSPC(String systemName) {
        return averageDurationSPCMap.get(systemName);
    }

    // C chart
    public SpcData getAppDurationSPC(String appId) {
        String[] appInfo = appId.split(":");
        String systemName = appInfo[0];
        String appName = appInfo[1];
        String version = appInfo[2];
        List<MgpLog> logs = logAnalyzer.getRecentResponseLogs(systemName, appName, version, 100);
        float valueCount = 0;
        int samplesNum = 0;
        Map<String, Float> values = new LinkedHashMap<>();
        for (MgpLog log : logs) {
            Integer duration = logAnalyzer.getResponseDuration(log);
            if (duration != null) {
                String time = dateFormat.format(log.getTimestamp());
                valueCount += duration;
                samplesNum ++;
                values.put(time, (float) duration);
            }
        }
        float cl = valueCount / samplesNum;
        float sd = getCChartSD(cl);
        float ucl = cl + 3*sd;
        float lcl = cl - 3*sd;
        if (lcl < 0) {
            lcl = 0;
        }
        return new SpcData(cl, ucl, lcl, values, "Duration", appName + ":" + version,
                new ArrayList<>(Collections.singletonList(SpcData.UCL)));
    }

    // Find low-usage version of apps
    private void checkLowUsageVersionAlert(String systemName, List<Service> services, int samplingDurationMinutes) {
        Map<String, Set<String>> appNameAndVerSetMap = new HashMap<>();
        for (Service service : services) {
            appNameAndVerSetMap.merge(service.getAppName(), new HashSet<>(Arrays.asList(service.getVersion())),
                    (oldSet, newSet) -> {
                oldSet.add(service.getVersion());
                return oldSet;
            });
        }
        appNameAndVerSetMap.forEach((appName, versions) -> {
            SpcData usageSpc = createVersionUsageSPC(systemName, appName, versions, samplingDurationMinutes);
            //logger.info(systemName + ":" + appName + " usage SPC, CL = " + usageSpc.getCl() + " UCL = " + usageSpc.getUcl() + " LCL = " + usageSpc.getLcl());
            usageSpc.getValues().forEach((version, usageMetrics) -> {
                //logger.info(systemName + ":" + appName + ":" + version + " usage metrics: " + usageMetrics);
                if (usageMetrics < usageSpc.getLcl()) {
                    notificationService.pushNotificationToSystem(systemName, new LowUsageVersionNotification(appName, version));
                    //logger.info("Found low usage version service: " + systemName + ":" + appName + ":" + version);
                }
            });
        });
    }

    private SpcData createVersionUsageSPC(String systemName, String appName, Set<String> versions, int samplingDurationMinutes) {
        float valueCount = 0;
        int samplesNum = versions.size();
        Map<String, Float> values = new HashMap<>();
        for (String version : versions) {
            float usageMetrics = logAnalyzer.getAppUsageMetrics(systemName, appName, version, samplingDurationMinutes);
            valueCount += usageMetrics;
            values.put(version, usageMetrics);
        }
        float cl = valueCount / samplesNum;
        float sd = getCChartSD(cl);
        float ucl = cl + 3*sd;
        float lcl = cl - 3*sd;
        if (lcl < 0) {
            lcl = 0;
        }
        return new SpcData(cl, ucl, lcl, values, "Usage", appName, new ArrayList<>(Collections.singletonList(SpcData.LCL)));
    }

    public SpcData getVersionUsageSPC(String appId) {
        String[] appInfo = appId.split(":");
        String systemName = appInfo[0];
        String appName = appInfo[1];
        List<Service> services = serviceRepository.findAllVersInSameSysBySysNameAndAppName(systemName, appName);
        Set<String> versions = new HashSet<>();
        for (Service service : services) {
            versions.add(service.getVersion());
        }
        return createVersionUsageSPC(systemName, appName, versions, 60);
    }

}
