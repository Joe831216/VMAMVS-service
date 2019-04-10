package com.soselab.microservicegraphplatform.bean.neo4j;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.neo4j.ogm.annotation.GraphId;
import org.neo4j.ogm.annotation.NodeEntity;
import org.neo4j.ogm.annotation.Relationship;

import java.util.Set;

@NodeEntity
public class Setting {

    @GraphId
    private Long id;

    private Boolean enableRestFailureAlert;
    private Boolean enableLogFailureAlert;
    private Float failureStatusRate;
    private Long failureErrorCount;

    public Setting() {
    }

    public Setting(Boolean enableRestFailureAlert, Boolean enableLogFailureAlert, Float failureStatusRate, Long failureErrorCount) {
        this.enableRestFailureAlert = enableRestFailureAlert;
        this.enableLogFailureAlert = enableLogFailureAlert;
        this.failureStatusRate = failureStatusRate;
        this.failureErrorCount = failureErrorCount;
    }

    public Long getId() {
        return id;
    }

    public Boolean getEnableRestFailureAlert() {
        return enableRestFailureAlert;
    }

    public void setEnableRestFailureAlert(Boolean enableRestFailureAlert) {
        this.enableRestFailureAlert = enableRestFailureAlert;
    }

    public Boolean getEnableLogFailureAlert() {
        return enableLogFailureAlert;
    }

    public void setEnableLogFailureAlert(Boolean enableLogFailureAlert) {
        this.enableLogFailureAlert = enableLogFailureAlert;
    }

    public Float getFailureStatusRate() {
        return failureStatusRate;
    }

    public void setFailureStatusRate(Float failureStatusRate) {
        this.failureStatusRate = failureStatusRate;
    }

    public Long getFailureErrorCount() {
        return failureErrorCount;
    }

    public void setFailureErrorCount(Long failureErrorCount) {
        this.failureErrorCount = failureErrorCount;
    }

    @Relationship(type = "MGP_CONFIG", direction = Relationship.INCOMING)
    private Service configService;

    public Service getConfigService() {
        return configService;
    }

    public void setConfigService(Service configService) {
        this.configService = configService;
    }

}
