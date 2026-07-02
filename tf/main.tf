resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project}-${var.location_short}"
  location = var.location
  tags     = var.tags
}

# ── Azure OpenAI ──────────────────────────────────────────────────────────
resource "azurerm_cognitive_account" "openai" {
  name                  = "oai-${var.project}-${var.location_short}"
  location              = azurerm_resource_group.main.location
  resource_group_name   = azurerm_resource_group.main.name
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = "oai-${var.project}-${var.location_short}"
  tags                  = var.tags
}

resource "azurerm_cognitive_deployment" "gpt" {
  name                 = var.model_name
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = var.model_name
    version = var.model_version
  }

  sku {
    name     = var.model_sku
    capacity = var.model_capacity
  }
}

# ── Storage account ───────────────────────────────────────────────────────
resource "random_string" "storage_suffix" {
  length  = 4
  special = false
  upper   = false
  numeric = true
}

resource "azurerm_storage_account" "main" {
  name                            = "st${var.project_short}${var.location_short}${random_string.storage_suffix.result}"
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  https_traffic_only_enabled      = true
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  tags                            = var.tags
}

# ── Static Web App (West Europe — not offered in Sweden Central) ───────────
resource "azurerm_static_web_app" "main" {
  name                = "swa-${var.project}-${var.swa_location_short}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.swa_location
  sku_tier            = "Free"
  sku_size            = "Free"
  tags                = var.tags
}
