variable "subscription_id" {
  description = "Azure subscription id (az account show). No default on purpose — pass -var or set TF_VAR_subscription_id."
  type        = string
}

variable "project" {
  description = "Project slug used in resource names: <resource>-<project>-<region>."
  type        = string
  default     = "codesurfacebench"
}

variable "project_short" {
  description = "Short slug for length-constrained names (storage accounts)."
  type        = string
  default     = "csbench"
}

variable "location" {
  description = "Primary Azure region for RG / OpenAI / storage."
  type        = string
  default     = "swedencentral"
}

variable "location_short" {
  description = "Short code for the primary region (naming convention)."
  type        = string
  default     = "sdc"
}

# Static Web Apps is not offered in Sweden Central, so it lands in West Europe.
variable "swa_location" {
  description = "Region for the Static Web App (must be a SWA-supported region)."
  type        = string
  default     = "westeurope"
}

variable "swa_location_short" {
  type    = string
  default = "we"
}

variable "model_name" {
  description = "Azure OpenAI model + deployment name."
  type        = string
  default     = "gpt-5.4-mini"
}

variable "model_version" {
  description = "Model version (az cognitiveservices model list)."
  type        = string
  default     = "2026-03-17"
}

variable "model_sku" {
  description = "Deployment SKU."
  type        = string
  default     = "GlobalStandard"
}

variable "model_capacity" {
  description = "Deployment capacity in units of 1K tokens/min."
  type        = number
  default     = 50
}

variable "openai_api_version" {
  description = "Azure OpenAI data-plane API version written into the app .env."
  type        = string
  default     = "2025-04-01-preview"
}

variable "tags" {
  type = map(string)
  default = {
    project   = "code-surface-benchmark"
    managedBy = "terraform"
    purpose   = "talk-demo"
  }
}
