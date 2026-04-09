# W3B蓝牙遥控器 - 项目记忆

## 项目概述
- 微信小程序蓝牙遥控器，iOS风格UI设计
- appid: wxded1a90527e518c1
- 单页面应用 (pages/index)，iOS深色主题

## 技术架构
- 纯原生微信小程序，无框架
- BLE串口通信 (FFE0/FFE1)，支持文本/二进制两种模式
- 自定义布局编辑模式（拖拽+缩放）
- 发送循环默认间隔100ms

## 重要修复记录 (2026-03-31)
- 修复3处蓝牙监听器重复注册（onBLEConnectionStateChange/onBLECharacteristicValueChange/onBluetoothDeviceFound）
- 统一sendInterval默认值100ms（之前代码中50和100混用）
- 修复二进制日志bytes[12]数组越界（只有12个元素0-11）
- 移除WXSS重复.dpad-btn定义（后面的圆形覆盖了前面的十字圆角设计）
- 修复gap:-1px无效CSS
- libVersion从trial改为3.3.4
- 清理app.js模板代码
- 提取_normalizeSettings方法统一兼容性处理
- 箭头函数替代that=this模式

## 当前已知限制
- 没有安装微信开发者工具CLI，无法在命令行编译
- 键位映射是硬编码的，不支持用户自定义
- 没有隐私协议声明（审核可能需要）
