output "resource_group" {
  value = azurerm_resource_group.main.name
}

output "azure_openai_endpoint" {
  value = azurerm_cognitive_account.openai.endpoint
}

output "azure_openai_deployment" {
  value = azurerm_cognitive_deployment.gpt.name
}

output "azure_openai_api_version" {
  value = var.openai_api_version
}

output "azure_openai_key" {
  value     = azurerm_cognitive_account.openai.primary_access_key
  sensitive = true
}

output "storage_account_name" {
  value = azurerm_storage_account.main.name
}

output "storage_connection_string" {
  value     = azurerm_storage_account.main.primary_connection_string
  sensitive = true
}

output "static_web_app_hostname" {
  value = azurerm_static_web_app.main.default_host_name
}

output "static_web_app_api_key" {
  value     = azurerm_static_web_app.main.api_key
  sensitive = true
}
