# API 密钥只存 chrome.storage.local

总结 API key 与转写 API key 只保存在 `chrome.storage.local`；普通配置进入 `chrome.storage.sync`，但写入同步存储前必须删除密钥字段。`chrome.storage.sync` 会跨设备同步且随浏览器账号导出，密钥一旦进入就会离开本机边界。读取时要兼容历史版本遗留在同步存储中的 `apiKey`：迁移到本地后立即从同步存储删除。总结缓存、日志、调试记录与发布包同样不得包含凭据。
