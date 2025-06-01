#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <netdb.h>
#include <esp_log.h>
#include <esp_wifi.h>
#include <nvs_flash.h>
#include <esp_event.h>
#include <esp_netif.h>
#include <esp_ota_ops.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "log_handler.h"

// #define WIFI_SSID "A10.14"
// #define WIFI_PASS "MMNT2004"
// #define SERVER_IP "192.168.1.241"

// #define WIFI_SSID "S20 FE"
// #define WIFI_PASS "25102004"
// #define SERVER_IP "192.168.189.85"

#define WIFI_SSID "Nhat Minh"
#define WIFI_PASS "14052004"
#define SERVER_IP "192.168.1.53"

// #define WIFI_SSID "UIT_CAR_RACING_2023"
// #define WIFI_PASS "sinhvien_CEEC"
// #define SERVER_IP "192.168.7.126"

#define SERVER_PORT 12345

static const char *TAG = "Custom_OTA";

static const char *TAG_Wifi = "WiFi_Connect";
static EventGroupHandle_t wifi_event_group;
const int CONNECTED_BIT = BIT0; // Bit to indicate Wi-Fi connection success

#define LED_GPIO_PIN GPIO_NUM_2

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START)
    {
        ESP_LOGI(TAG_Wifi, "Wi-Fi started, attempting to connect...");
        esp_wifi_connect();
    }
    else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED)
    {
        ESP_LOGE(TAG_Wifi, "Disconnected. Reconnecting...");
        esp_wifi_connect();
    }
    else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP)
    {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG_Wifi, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(wifi_event_group, CONNECTED_BIT);
    }
}

void connect_to_wifi(void)
{
    ESP_LOGI(TAG_Wifi, "Initializing Wi-Fi...");

    // Initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND)
    {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }

    // Initialize network interface and event loop
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    // Create Wi-Fi station interface
    esp_netif_create_default_wifi_sta();

    // Initialize Wi-Fi
    wifi_init_config_t wifi_init_cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&wifi_init_cfg));

    // Create event group to signal connection success
    wifi_event_group = xEventGroupCreate();

    // Register event handlers
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

    // Configure Wi-Fi settings
    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(ESP_IF_WIFI_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG_Wifi, "Waiting for Wi-Fi connection...");
    xEventGroupWaitBits(wifi_event_group, CONNECTED_BIT, false, true, portMAX_DELAY);
    ESP_LOGI(TAG_Wifi, "Wi-Fi connected successfully!");
}

int init_socket()
{
    int socket_fd;
    struct sockaddr_in server_addr;
    // Initialize server address
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = inet_addr(SERVER_IP);
    server_addr.sin_port = htons(SERVER_PORT);
    // Create socket
    socket_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (socket_fd < 0)
    {
        ESP_LOGE(TAG, "Failed to create socket.");
        return -1;
    }
    // Connect to the server
    if (connect(socket_fd, (struct sockaddr *)&server_addr, sizeof(server_addr)) != 0)
    {
        ESP_LOGE(TAG, "Failed to connect to server.");
        close(socket_fd);
        return -1;
    }
    ESP_LOGI(TAG, "Socket connected to %s:%d", SERVER_IP, SERVER_PORT);
    return socket_fd; // Return the connected socket
}

void ota_update_task(void *pvParameter)
{
    if (pvParameter == NULL)
    {
        ESP_LOGE(TAG, "Invalid parameter passed to ota_update_task.");
        vTaskDelete(NULL);
        return;
    }

    int socket_fd = *(int *)pvParameter;

    char buffer[1024];
    int received_bytes;

    ESP_LOGI(TAG, "Starting OTA process...");

    ESP_LOGI(TAG, "Connected to server. Beginning firmware download...");

    static esp_ota_handle_t ota_handle;
    static const esp_partition_t *update_partition = NULL;

    if (!update_partition)
    {
        update_partition = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);
        if (esp_ota_begin(update_partition, OTA_SIZE_UNKNOWN, &ota_handle) != ESP_OK)
        {
            ESP_LOGE(TAG, "OTA initialization failed!");
            close(socket_fd);
            vTaskDelete(NULL);
            return;
        }
        ESP_LOGI(TAG, "OTA initialized.");
    }

    while ((received_bytes = recv(socket_fd, buffer, sizeof(buffer), 0)) > 0)
    {
        if (esp_ota_write(ota_handle, buffer, received_bytes) != ESP_OK)
        {
            ESP_LOGE(TAG, "Error writing to OTA partition.");
            close(socket_fd);
            esp_ota_end(ota_handle);
            vTaskDelete(NULL);
            return;
        }
    }

    if (received_bytes < 0)
    {
        ESP_LOGE(TAG, "Error receiving firmware.");
    }
    else
    {
        ESP_LOGW(TAG, "Firmware download complete.");
        if (esp_ota_end(ota_handle) == ESP_OK)
        {
            esp_ota_set_boot_partition(update_partition);
            ESP_LOGI(TAG, "OTA Update complete. Rebooting...");
            esp_restart();
        }
        else
        {
            ESP_LOGE(TAG, "OTA End failed.");
        }
    }

    close(socket_fd);
    vTaskDelete(NULL);
}

void app_main(void)
{
    int socket;
    ESP_LOGI(TAG, "Custom ESP32 OTA Update");
    connect_to_wifi();
    socket = init_socket();
    // log_init(socket);
    xTaskCreate(&ota_update_task, "ota_update_task", 8192, (void *)&socket, 5, NULL);
}
