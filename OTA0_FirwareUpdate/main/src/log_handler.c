#include "log_handler.h"
#include "esp_log.h"
#include "lwip/sockets.h"
#include <stdarg.h>

// Socket tĩnh, chỉ được truy cập trong module này
static int client_socket = -1;

void log_to_tcp(const char *format, va_list args)
{
    if (client_socket > 0)
    {
        char buffer[256];
        char log_buffer[300];
        int len = vsnprintf(buffer, sizeof(buffer), format, args);
        if (len > 0)
        {
            snprintf(log_buffer, sizeof(log_buffer), "LOG:%s", buffer);
            send(client_socket, log_buffer, len + 4, 0);
        }
    }
}

void log_init(int socket)
{
    client_socket = socket;          // Lưu socket client
    esp_log_set_vprintf(log_to_tcp); // Redirect log sang TCP
    esp_log_level_set("*", ESP_LOG_WARN);
}