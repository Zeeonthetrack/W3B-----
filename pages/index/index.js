// 标准BLE串口服务UUID，适用于HC-05、HC-06等蓝牙模块
const SERVICE_UUID = "0000FFE0-0000-1000-8000-00805F9B34FB";
const CHAR_UUID = "0000FFE1-0000-1000-8000-00805F9B34FB";

// 可能的其他常用UUID配置（用于调试）
const ALTERNATE_SERVICE_UUID = "00001800-0000-1000-8000-00805F9B34FB";
const ALTERNATE_CHAR_UUID = "00002A00-0000-1000-8000-00805F9B34FB";

Page({
  data: {
    connectStatus: "未连接",
    bleAvailable: false,
    isSearching: false,
    isConnected: false,
    deviceList: [],
    connectedDeviceId: "",
    lastDeviceId: "",
    writeCharacteristicId: "",
    serviceId: SERVICE_UUID,
    characteristicId: CHAR_UUID,
    filterDeviceName: "W3B",

    leftSpeed: 0,
    rightSpeed: 0,
    leftByte: 127,
    rightByte: 127,

    btnRed: 0,
    btnBlue: 0,
    btnGreen: 0,
    btnYellow: 0,
    btnCenter: 0,
    btnLeftA: 0,
    btnLeftB: 0,
    btnRightC: 0,
    btnRightD: 0,
    
    // 滑杆相关状态
    sliderPosition: 50, // 默认中间位置 (0-100%)
    sliderRect: null,

    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    logList: [],

    showLogPanel: false,
    showSettings: false,
    settings: {
      sendMode: 'text', // text 或 binary，默认为文本模式
      sendInterval: 100,
      autoClearLog: false,
      fontSize: 'medium'
    },
    tempSettings: {}, // For holding unsaved changes
    sendTimer: null,
    autoSaveTimer: null, // 自动保存定时器
    
    // 自定义数字键盘相关
    showCustomKeyboard: false, // 是否显示自定义键盘
    keyboardTitle: '发送间隔(ms)', // 键盘标题
    currentInputField: '', // 当前输入的字段名
    currentInputValue: '', // 当前输入的值
    
    navBarHeight: 0,
    menuButtonInfo: {},

    // --- Custom Layout Mode Data ---
    isEditMode: false,
    activeElement: null,
    layout: {
      leftJoystick: { x: 0, y: 0, scale: 1 },
      rightJoystick: { x: 0, y: 0, scale: 1 },
      buttons: { x: 0, y: 0, scale: 1 },
      leftButtons: { x: 0, y: 0, scale: 1 },
      rightButtons: { x: 0, y: 0, scale: 1 },
      logContainer: { x: 0, y: 0, scale: 1 },
      slider: { x: 0, y: 0, scale: 1 }
    },
    initialLayout: null,
    touchStart: null,
  },

  onLoad() {
    this.padRect = { left: null, right: null };
    this.activeTouches = { left: null, right: null };
    
    const that = this;
    
    // Load custom layout with backward compatibility
    const savedLayout = wx.getStorageSync('customLayout');
    if (savedLayout) {
      // 合并新组件的默认值，确保向后兼容
      const defaultLayout = {
        leftJoystick: { x: 0, y: 0, scale: 1 },
        rightJoystick: { x: 0, y: 0, scale: 1 },
        buttons: { x: 0, y: 0, scale: 1 },
        leftButtons: { x: 0, y: 0, scale: 1 },
        rightButtons: { x: 0, y: 0, scale: 1 },
        logContainer: { x: 0, y: 0, scale: 1 },
        slider: { x: 0, y: 0, scale: 1 }
      };
      // 合并保存的布局和默认布局，确保所有组件都有值
      const mergedLayout = { ...defaultLayout, ...savedLayout };
      that.setData({ layout: mergedLayout });
    }
    
    // Load app state for crash recovery
    const savedState = wx.getStorageSync('appState');
    if (savedState) {
      // Restore important state except for temporary UI states
      const { lastDeviceId, settings } = savedState;
      if (lastDeviceId) {
        that.setData({ lastDeviceId });
      }
      if (settings) {
        // 向后兼容处理：将原来的useBinary转换为sendMode
        if (settings.hasOwnProperty('useBinary')) {
          settings.sendMode = settings.useBinary ? 'binary' : 'text';
          delete settings.useBinary;
        }
        // 如果没有sendMode，则默认为text
        if (!settings.hasOwnProperty('sendMode')) {
          settings.sendMode = 'text';
        }
        // 如果没有sendInterval，或者值为默认的50，使用新的默认值100
        if (!settings.hasOwnProperty('sendInterval') || settings.sendInterval === 50) {
          settings.sendInterval = 100;
        }
        that.setData({ settings });
      }
    }
    
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = (menuButtonInfo.height + (menuButtonInfo.top - systemInfo.statusBarHeight) * 2) * 1.2;
    
    that.setData({
      navBarHeight: navBarHeight,
      menuButtonInfo: menuButtonInfo
    });
    
    wx.getStorage({
      key: 'userSettings',
      success (res) {
        if(res.data) {
          // 向后兼容处理：将原来的useBinary转换为sendMode
          const settings = res.data;
          if (settings.hasOwnProperty('useBinary')) {
            settings.sendMode = settings.useBinary ? 'binary' : 'text';
            delete settings.useBinary;
          }
          // 如果没有sendMode，则默认为text
          if (!settings.hasOwnProperty('sendMode')) {
            settings.sendMode = 'text';
          }
          // 如果没有sendInterval，或者值为默认的50，使用新的默认值100
          if (!settings.hasOwnProperty('sendInterval') || settings.sendInterval === 50) {
            settings.sendInterval = 100;
          }
          that.setData({ settings: settings });
        } else {
          // 如果没有保存的设置，使用默认值100
          that.setData({
            'settings.sendInterval': 100
          });
        }
        that.startSendLoop();
      },
      fail () {
        // 读取失败时，确保使用默认值100
        that.setData({
          'settings.sendInterval': 100
        });
        that.startSendLoop();
      }
    });

    this.initBluetooth();
    
    // Start auto-save timer
    this.startAutoSave();
  },

  onReady() {
    this.measurePads();
  },

  onUnload() {
    this.stopSendLoop();
    this.stopAutoSave();
    this.disconnectDevice();
    wx.closeBluetoothAdapter();
  },

  startSendLoop() {
    this.stopSendLoop();
    const interval = this.data.settings.sendInterval || 50;
    this.data.sendTimer = setInterval(() => {
      this.sendPacketTask();
    }, interval);
  },

  stopSendLoop() {
    if (this.data.sendTimer) {
      clearInterval(this.data.sendTimer);
      this.data.sendTimer = null;
    }
  },
  
  // Auto-save functionality
  startAutoSave() {
    this.stopAutoSave(); // Clear existing timer if any
    // Save state every 30 seconds
    this.data.autoSaveTimer = setInterval(() => {
      this.autoSaveState();
    }, 30000);
  },
  
  stopAutoSave() {
    if (this.data.autoSaveTimer) {
      clearInterval(this.data.autoSaveTimer);
      this.data.autoSaveTimer = null;
    }
  },
  
  autoSaveState() {
    // Save important state for crash recovery
    const stateToSave = {
      lastDeviceId: this.data.lastDeviceId,
      settings: this.data.settings,
      layout: this.data.layout
    };
    wx.setStorageSync('appState', stateToSave);
    console.log('自动保存状态成功');
  },

  sendPacketTask() {
    // 减少日志输出，只在调试模式下输出
    // console.log("=== 开始发送数据包 ===");
    // console.log("连接状态:", this.data.isConnected);
    // console.log("特征值ID:", this.data.writeCharacteristicId);
    // console.log("服务ID:", this.data.serviceId);
    
    // Always calculate bytes based on current speed
    const leftByte = this.mapSpeedToByte(this.data.leftSpeed);
    const rightByte = this.mapSpeedToByte(this.data.rightSpeed);
    
    // console.log("速度值:", this.data.leftSpeed, this.data.rightSpeed);
    // console.log("映射后的字节值:", leftByte, rightByte);
    
    // Build packet
    const packet = this.buildPacket(leftByte, rightByte);
    
    // console.log("构建的数据包:", packet);
    // console.log("数据包类型:", typeof packet);
    
    // Always log (if binary mode or whatever, logging logic remains)
    this.appendLog(packet);
    
    // Only write if connected and has writeCharacteristicId
    if (this.data.isConnected && this.data.writeCharacteristicId) {
      // console.log("开始发送数据...");
      this.writePacket(packet);
    } else {
      // 减少错误日志输出频率
      if (!this.lastSendErrorLog || Date.now() - this.lastSendErrorLog > 1000) {
        // console.error("发送条件不满足:", {
        //   isConnected: this.data.isConnected,
        //   writeCharacteristicId: this.data.writeCharacteristicId
        // });
        this.lastSendErrorLog = Date.now();
      }
    }
    // console.log("=== 发送数据包结束 ===");
  },

  initBluetooth() {
    wx.openBluetoothAdapter({
      success: () => {
        this.setData({ bleAvailable: true, connectStatus: "未连接" });
        wx.onBluetoothAdapterStateChange((res) => {
          if (!res.available) {
            this.setData({
              connectStatus: "蓝牙未开启",
              bleAvailable: false,
              isConnected: false
            });
            wx.showToast({ title: "请开启手机蓝牙", icon: "none" });
          } else {
            this.setData({ bleAvailable: true, connectStatus: this.data.isConnected ? "已连接" : "未连接" });
          }
        });
      },
      fail: (err) => {
        console.error("蓝牙初始化失败:", err);
        let errorMsg = "请开启手机蓝牙";
        if (err.errCode === 10001) {
          errorMsg = "蓝牙未开启，请在设置中开启蓝牙";
        } else if (err.errCode === 10002) {
          errorMsg = "蓝牙适配器不可用，请重启设备后重试";
        } else if (err.errCode === 10003) {
          errorMsg = "蓝牙适配器已被占用，请关闭其他蓝牙应用后重试";
        }
        this.setData({ bleAvailable: false, connectStatus: "蓝牙不可用" });
        wx.showToast({ title: errorMsg, icon: "none", duration: 3000 });
      }
    });
  },

  checkLocationPermission() {
    const system = wx.getSystemInfoSync();
    if (system.platform !== "android") return;

    wx.getSetting({
      success: (res) => {
        if (!res.authSetting["scope.userLocation"]) {
          // 主动请求位置权限
          wx.authorize({
            scope: "scope.userLocation",
            success: () => {
              // 权限请求成功，无需处理
            },
            fail: () => {
              // 权限请求失败，提示用户去设置页面开启
              wx.showModal({
                title: "需要位置权限",
                content: "安卓搜索蓝牙需要开启位置权限",
                confirmText: "去开启",
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting();
                  }
                }
              });
            }
          });
        }
      }
    });
  },

  startSearch() {
    if (this.data.isSearching) return;
    if (!this.data.bleAvailable) {
      wx.showToast({ title: "请开启手机蓝牙", icon: "none" });
      return;
    }

    this.checkLocationPermission();

    this.setData({ deviceList: [], isSearching: true });

    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      success: () => {
        wx.showToast({ title: "正在搜索设备...", icon: "loading" });
        wx.onBluetoothDeviceFound((res) => {
          res.devices.forEach((device) => {
            if (!device.name || device.name.indexOf(this.data.filterDeviceName) === -1) return;

            const list = this.data.deviceList;
            const isExist = list.some((item) => item.deviceId === device.deviceId);
            if (!isExist) {
              list.push(device);
              this.setData({ deviceList: list });
            }
          });
        });

        setTimeout(() => {
          this.stopSearch();
        }, 10000);
      },
      fail: () => {
        this.setData({ isSearching: false });
        wx.showToast({ title: "搜索失败，请检查权限", icon: "none" });
      }
    });
  },

  stopSearch() {
    wx.stopBluetoothDevicesDiscovery({
      success: () => {
        this.setData({ isSearching: false });
      }
    });
  },

  closeDeviceList() {
    this.stopSearch();
    this.setData({ deviceList: [] });
  },

  connectDevice(e) {
    const deviceId = e.currentTarget.dataset.deviceid;
    this.connectDeviceById(deviceId);
  },

  reconnectLast() {
    if (!this.data.lastDeviceId || this.data.isConnected) return;
    this.connectDeviceById(this.data.lastDeviceId);
  },

  connectDeviceById(deviceId) {
    if (!deviceId || this.data.isConnected) return;

    wx.showLoading({ title: "正在连接..." });
    this.closeDeviceList();

    wx.createBLEConnection({
      deviceId,
      success: (res) => {
        console.log("设备连接成功:", res);
        
        // 只更新基本连接状态，特征值获取成功后才显示完全连接
        this.setData({
          connectedDeviceId: deviceId,
          lastDeviceId: deviceId,
          connectStatus: "连接中...",
          isConnected: true, // 保持连接状态为true，但显示连接中
          writeCharacteristicId: "" // 重置特征值ID
        });
        
        setTimeout(() => {
          this.getDeviceService(deviceId);
        }, 500);

        wx.onBLEConnectionStateChange((res) => {
          console.log("连接状态变化:", res);
          if (!res.connected) {
            this.setData({
              connectStatus: "连接已断开",
              isConnected: false,
              connectedDeviceId: "",
              writeCharacteristicId: ""
            });
            wx.showToast({ title: "连接已断开", icon: "none" });
          }
        });
      },
      fail: (err) => {
        console.error("设备连接失败:", err);
        wx.hideLoading();
        let errorMsg = "连接失败";
        if (err.errCode === 10012) {
          errorMsg = "连接超时，请确保设备在附近并处于可连接状态";
        } else if (err.errCode === 10013) {
          errorMsg = "设备连接失败，请检查设备是否正常工作";
        } else if (err.errCode === 10014) {
          errorMsg = "设备已断开连接，请重新搜索连接";
        } else {
          errorMsg = `连接失败: ${err.errMsg}`;
        }
        wx.showToast({ title: errorMsg, icon: "none", duration: 3000 });
      }
    });
  },

  getDeviceService(deviceId) {
    console.log("=== 开始获取设备服务 ===");
    console.log("设备ID:", deviceId);
    
    wx.getBLEDeviceServices({
      deviceId,
      success: (res) => {
        console.log("获取到的服务列表:", res.services);
        wx.hideLoading();
        
        // 显示所有可用服务
        res.services.forEach((s, index) => {
          console.log(`服务${index}: ${s.uuid}, 主服务: ${s.isPrimary}`);
        });
        
        // 查找匹配的服务
        const service = res.services.find((item) => item.uuid.toUpperCase() === this.data.serviceId.toUpperCase());
        if (!service) {
          wx.showToast({ title: `未找到匹配服务: ${this.data.serviceId}`, icon: "none" });
          console.error("未找到匹配服务:", this.data.serviceId);
          return;
        }

        console.log("找到匹配服务:", service);
        wx.showToast({ title: `找到匹配服务`, icon: "success" });
        
        setTimeout(() => {
          this.getDeviceCharacteristic(deviceId, service.uuid);
        }, 200);
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("获取服务失败:", err);
        let errorMsg = "获取服务失败";
        if (err.errCode === 10015) {
          errorMsg = "设备服务不可用，请重新连接设备";
        } else if (err.errCode === 10016) {
          errorMsg = "设备连接已断开，请重新搜索连接";
        } else {
          errorMsg = `获取服务失败: ${err.errMsg}`;
        }
        wx.showToast({ title: errorMsg, icon: "none", duration: 3000 });
      }
    });
  },

  getDeviceCharacteristic(deviceId, serviceId) {
    console.log("=== 开始获取设备特征值 ===");
    console.log("设备ID:", deviceId);
    console.log("服务ID:", serviceId);
    
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (res) => {
        console.log("获取到的特征值列表:", res.characteristics);
        
        wx.showToast({ title: `找到${res.characteristics.length}个特征值`, icon: "none" });
        
        // 显示所有特征值的信息，便于调试
        res.characteristics.forEach((item, index) => {
          console.log(`特征值${index}: ${item.uuid}, 支持write: ${item.properties.write}, writeWithoutResponse: ${item.properties.writeWithoutResponse}`);
        });
        
        // 查找匹配的特征值，支持write或writeWithoutResponse
        const characteristic = res.characteristics.find(
          (item) => item.uuid.toUpperCase() === this.data.characteristicId.toUpperCase() && 
                   (item.properties.write || item.properties.writeWithoutResponse)
        );
        
        // 如果没找到指定特征值，尝试查找第一个可写特征值
        let fallbackCharacteristic;
        if (!characteristic) {
          console.log(`未找到指定特征值: ${this.data.characteristicId}，尝试查找第一个可写特征值`);
          fallbackCharacteristic = res.characteristics.find(
            (item) => item.properties.write || item.properties.writeWithoutResponse
          );
        }
        
        const targetCharacteristic = characteristic || fallbackCharacteristic;
        
        if (!targetCharacteristic) {
          wx.showToast({ title: "未找到任何可写特征值", icon: "none" });
          console.error("未找到任何可写特征值:", res.characteristics);
          return;
        }

        console.log("找到可写特征值:", targetCharacteristic);
        console.log("特征值属性:", {
          write: targetCharacteristic.properties.write,
          writeWithoutResponse: targetCharacteristic.properties.writeWithoutResponse,
          notify: targetCharacteristic.properties.notify,
          indicate: targetCharacteristic.properties.indicate
        });
        
        wx.showToast({ title: `特征值连接成功`, icon: "success" });
        
        // 只有获取到可写特征值后才显示完全连接
        this.setData({ 
          writeCharacteristicId: targetCharacteristic.uuid, 
          serviceId, 
          connectStatus: "已连接"
        });
        
        // 如果特征值支持notify，启用特征值监听
        if (targetCharacteristic.properties.notify || targetCharacteristic.properties.indicate) {
          console.log("启用特征值监听");
          wx.notifyBLECharacteristicValueChange({
            deviceId: deviceId,
            serviceId: serviceId,
            characteristicId: targetCharacteristic.uuid,
            state: true,
            success: (res) => {
              console.log("特征值监听启用成功:", res);
              // 监听特征值变化
              wx.onBLECharacteristicValueChange((res) => {
                console.log("收到特征值变化:", res);
                console.log("收到的数据:", new Uint8Array(res.value));
                // 可以在这里处理设备返回的数据
              });
            },
            fail: (err) => {
              console.error("特征值监听启用失败:", err);
            }
          });
        }
        
        console.log("=== 设备连接完全成功！可以开始发送数据 ===");
      },
      fail: (err) => {
        console.error("获取特征值失败:", err);
        let errorMsg = "获取特征值失败";
        if (err.errCode === 10017) {
          errorMsg = "设备特征值不可用，请重新连接设备";
        } else if (err.errCode === 10018) {
          errorMsg = "设备连接已断开，请重新搜索连接";
        } else {
          errorMsg = `获取特征值失败: ${err.errMsg}`;
        }
        wx.showToast({ title: errorMsg, icon: "none", duration: 3000 });
      }
    });
  },

  disconnectDevice() {
    if (!this.data.isConnected) return;

    wx.closeBLEConnection({
      deviceId: this.data.connectedDeviceId,
      success: () => {
        this.setData({
          connectStatus: "未连接",
          isConnected: false,
          connectedDeviceId: "",
          writeCharacteristicId: ""
        });
        wx.showToast({ title: "已断开连接" });
      }
    });
  },

  measurePads() {
    const query = wx.createSelectorQuery();
    query.select("#leftPad").boundingClientRect();
    query.select("#rightPad").boundingClientRect();
    query.exec((res) => {
      if (res[0]) this.padRect.left = res[0];
      if (res[1]) this.padRect.right = res[1];
    });
  },

  onJoystickStart(e) {
    const side = e.currentTarget.dataset.side;
    if (!this.padRect[side]) return;

    const touch = e.changedTouches[0];
    this.activeTouches[side] = touch.identifier;
    this.updateJoystickByTouch(side, touch);
  },

  onJoystickMove(e) {
    const side = e.currentTarget.dataset.side;
    const activeId = this.activeTouches[side];
    if (activeId === null) return;

    const touch = this.findTouchById(e.changedTouches, activeId);
    if (!touch) return;

    this.updateJoystickByTouch(side, touch);
  },

  onJoystickEnd(e) {
    const side = e.currentTarget.dataset.side;
    const activeId = this.activeTouches[side];
    if (activeId === null) return;

    const touch = this.findTouchById(e.changedTouches, activeId);
    if (!touch) return;

    this.activeTouches[side] = null;
    const speedKey = side === "left" ? "leftSpeed" : "rightSpeed";
    const stickKey = side === "left" ? "leftStick" : "rightStick";

    this.setData({
      [speedKey]: 0,
      [stickKey]: { x: 0, y: 0 }
    });
  },

  updateJoystickByTouch(side, touch) {
    const rect = this.padRect[side];
    if (!rect) return;

    // 预计算中心点和最大半径，优化计算
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width / 2 - rect.width * 0.16;

    let dx = touch.pageX - centerX;
    let dy = touch.pageY - centerY;
    
    // 优化：使用平方距离比较，避免开方运算
    const distanceSquared = dx * dx + dy * dy;
    const maxRadiusSquared = maxRadius * maxRadius;

    if (distanceSquared > maxRadiusSquared) {
      // 只在必要时计算平方根
      const scale = maxRadius / Math.sqrt(distanceSquared);
      dx *= scale;
      dy *= scale;
    }

    // 优化：简化速度计算，提高响应速度
    const normalizedY = -dy / maxRadius;
    
    // 优化：使用分段线性映射替代幂函数，提高计算效率
    let mappedValue;
    if (Math.abs(normalizedY) <= 0.1) {
      mappedValue = normalizedY; // 中心区域，线性响应
    } else if (Math.abs(normalizedY) <= 0.5) {
      mappedValue = Math.sign(normalizedY) * (0.1 + (Math.abs(normalizedY) - 0.1) * 1.125); // 中间区域，增强响应
    } else {
      mappedValue = Math.sign(normalizedY) * (0.6 + (Math.abs(normalizedY) - 0.5) * 0.8); // 边缘区域，平滑过渡
    }
    
    const value = Math.round(mappedValue * 100);
    const speed = this.clamp(value, -100, 100);

    const speedKey = side === "left" ? "leftSpeed" : "rightSpeed";
    const stickKey = side === "left" ? "leftStick" : "rightStick";
    const currentSpeed = this.data[speedKey];
    const currentStick = this.data[stickKey];

    // 优化：减少setData调用频率
    if (Math.abs(speed - currentSpeed) < 2) {
      // 只有摇杆位置变化明显时才更新
      if (Math.abs(dx - currentStick.x) > 1 || Math.abs(dy - currentStick.y) > 1) {
        this.setData({
          [stickKey]: { x: dx, y: dy }
        });
      }
      return;
    }

    // 批量更新，减少setData调用
    this.setData({
      [speedKey]: speed,
      [stickKey]: { x: dx, y: dy }
    });
    // Removed direct send, now handled by loop
    /*this.syncBytesAndSend();*/
  },

  findTouchById(touches, id) {
    // 优化：使用更高效的循环方式
    const len = touches.length;
    for (let i = 0; i < len; i++) {
      if (touches[i].identifier === id) {
        return touches[i];
      }
    }
    return null;
  },

  onButtonTouchStart(e) {
    const color = e.currentTarget.dataset.color;
    this.updateButtonState(color, 1);
  },

  onButtonTouchEnd(e) {
    const color = e.currentTarget.dataset.color;
    this.updateButtonState(color, 0);
  },

  updateButtonState(color, pressed) {
    const map = {
      red: "btnRed",
      blue: "btnBlue",
      green: "btnGreen",
      yellow: "btnYellow",
      purple: "btnCenter",
      leftA: "btnLeftA",
      leftB: "btnLeftB",
      rightC: "btnRightC",
      rightD: "btnRightD"
    };
    const key = map[color];
    if (!key) return;

    this.setData({ [key]: pressed });
    // Removed direct send
    /*this.syncBytesAndSend();*/
  },

  // Helper, now called by sendLoop
  mapSpeedToByte(speed) {
    const raw = Math.round((speed + 100) * 1.275);
    return this.clamp(raw, 0, 255);
  },

  // 兼容性更好的字符串转ArrayBuffer函数
  stringToArrayBuffer(str) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  },

  buildPacket(leftByte, rightByte) {
    if (this.data.settings.sendMode === 'text') {
      // 文本模式: [j,Lx,Ly,Rx,Ry,C,A,B,C,D]
      // 使用标准化的速度值，与界面显示一致
      const Lx = this.data.leftSpeed;
      const Rx = this.data.rightSpeed;
      // 按钮状态，↑/↓/←/→/中间键/左侧A/B/右侧C/D对应不同的值
      const Ly = this.data.btnRed ? 1 : 0;
      const Ry = this.data.btnBlue ? 1 : 0;
      const C = this.data.btnCenter ? 1 : 0;
      const A = this.data.btnLeftA ? 1 : 0;
      const B = this.data.btnLeftB ? 1 : 0;
      const RC = this.data.btnRightC ? 1 : 0;
      const RD = this.data.btnRightD ? 1 : 0;
      const textPacket = `[j,${Lx},${Ly},${Rx},${Ry},${C},${A},${B},${RC},${RD}]`;
      return textPacket;
    } else {
      // 二进制模式（原有格式）
      const b0 = leftByte;
      const b1 = rightByte;
      const b2 = this.data.btnRed ? 1 : 0;
      const b3 = this.data.btnBlue ? 2 : 0;
      const b4 = this.data.btnGreen ? 3 : 0;
      const b5 = this.data.btnYellow ? 4 : 0;
      const b6 = this.data.btnCenter ? 5 : 0;
      const b7 = this.data.btnLeftA ? 6 : 0;
      const b8 = this.data.btnLeftB ? 7 : 0;
      const b9 = this.data.btnRightC ? 8 : 0;
      const b10 = this.data.btnRightD ? 9 : 0;
      const checksum = b0 ^ b1 ^ b2 ^ b3 ^ b4 ^ b5 ^ b6 ^ b7 ^ b8 ^ b9 ^ b10;
      const b11 = checksum ^ 0x55;

      return new Uint8Array([b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11]);
    }
  },

  writePacket(packet) {
    console.log("=== 开始调用writeBLECharacteristicValue ===");
    console.log("设备ID:", this.data.connectedDeviceId);
    console.log("服务ID:", this.data.serviceId);
    console.log("特征值ID:", this.data.writeCharacteristicId);
    
    let buffer;
    if (typeof packet === 'string') {
      // 文本模式：将字符串转换为ArrayBuffer
      console.log("文本模式数据包:", packet);
      // 使用兼容性更好的方式转换字符串到ArrayBuffer
      buffer = this.stringToArrayBuffer(packet);
      console.log("转换后的ArrayBuffer:", buffer);
      console.log("ArrayBuffer大小:", buffer.byteLength);
    } else {
      // 二进制模式：直接使用Uint8Array的buffer
      console.log("二进制模式数据包:", packet);
      buffer = packet.buffer;
      console.log("Uint8Array的buffer:", buffer);
      console.log("buffer大小:", buffer.byteLength);
    }
    
    // 检查buffer是否有效
    if (!buffer || buffer.byteLength === 0) {
      console.error("无效的buffer，无法发送数据:", buffer);
      return;
    }
    
    wx.writeBLECharacteristicValue({
      deviceId: this.data.connectedDeviceId,
      serviceId: this.data.serviceId,
      characteristicId: this.data.writeCharacteristicId,
      value: buffer,
      success: (res) => {
        console.log("数据发送成功:", res);
      },
      fail: (res) => {
        console.error("数据发送失败:", res);
        console.error("错误码:", res.errCode);
        console.error("错误信息:", res.errMsg);
        
        // 只在首次失败时显示提示，避免频繁弹窗
        if (!this.hasSendError) {
          this.hasSendError = true;
          let errorMsg = "发送失败";
          if (res.errCode === 10020) {
            errorMsg = "设备不可写，请检查设备是否支持写入操作";
          } else if (res.errCode === 10021) {
            errorMsg = "设备连接已断开，请重新搜索连接";
          } else if (res.errCode === 10022) {
            errorMsg = "发送数据过大，请减少数据量";
          } else {
            errorMsg = `发送失败: ${res.errMsg}`;
          }
          wx.showToast({ title: errorMsg, icon: "none", duration: 3000 });
          // 3秒后重置错误标记
          setTimeout(() => {
            this.hasSendError = false;
          }, 3000);
        }
      }
    });
    
    console.log("=== writeBLECharacteristicValue调用结束 ===");
  },


  appendLog(packet) {
    // 优化：减少日志处理频率，只在日志面板显示时处理
    if (!this.data.showLogPanel) {
      // 日志面板未显示时，只保留最新的日志条目，减少内存占用
      if (this.data.logList.length === 0) {
        // 只保留第一条日志，用于快速查看
        let hex, hexRaw;
        if (typeof packet === 'string') {
          hex = packet;
          hexRaw = packet;
        } else {
          const bytes = Array.from(packet);
          hexRaw = bytes.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          hex = `L:${bytes[0].toString(16).padStart(2,"0").toUpperCase()} R:${bytes[1].toString(16).padStart(2,"0").toUpperCase()} ...`;
        }
        const time = this.formatTime(new Date());
        this.setData({ logList: [{ time, hex, hexRaw }] });
      }
      return;
    }
    
    let hex, hexRaw;
    
    if (typeof packet === 'string') {
      // 文本模式日志
      hex = packet;
      hexRaw = packet;
    } else {
      // 二进制模式日志（原有格式）
      const bytes = Array.from(packet);
      hexRaw = bytes.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join(" ");
      hex = `L:${bytes[0].toString(16).padStart(2,"0").toUpperCase()} R:${bytes[1].toString(16).padStart(2,"0").toUpperCase()} ↑:${bytes[2]} ↓:${bytes[3]} ←:${bytes[4]} →:${bytes[5]} ○:${bytes[6]} A:${bytes[7]} B:${bytes[8]} C:${bytes[9]} D:${bytes[10]} X:${bytes[11].toString(16).padStart(2,"0").toUpperCase()} T:${bytes[12]?.toString(16).padStart(2,"0").toUpperCase() || ''}`;
    }
    
    const time = this.formatTime(new Date());
    const next = [{ time, hex, hexRaw }, ...this.data.logList];
    
    // Auto clear log check
    const maxLogs = this.data.settings.autoClearLog ? 50 : 100;
    if (next.length > maxLogs) {
      this.setData({ logList: next.slice(0, maxLogs) });
    } else {
      this.setData({ logList: next }); 
    }
  },

  clearLog() {
    this.setData({ logList: [] });
  },

  formatTime(date) {
    const pad = (num) => num.toString().padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },

  toggleLogPanel() {
    this.setData({ showLogPanel: !this.data.showLogPanel });
  },

  closeLogPanel() {
    this.setData({ showLogPanel: false });
  },

  toggleSettings() {
    // Copy current settings to temp when opening
    this.setData({ 
      showSettings: !this.data.showSettings,
      tempSettings: {...this.data.settings} 
    });
  },

  closeSettings() {
    // Discard changes
    this.setData({ showSettings: false });
  },

  stopProp() {},

  toggleAutoClear(e) {
    this.setData({ 'settings.autoClearLog': e.detail.value });
  },

  // Settings Handlers
  onSettingChange(e) {
    const field = e.currentTarget.dataset.field;
    let value = e.detail.value;
    
    if(field === 'sendInterval') {
      const parsed = parseInt(value);
      value = isNaN(parsed) ? 50 : parsed;
    }

    const temp = this.data.tempSettings;
    temp[field] = value;
    this.setData({ tempSettings: temp });
  },

  setFontSize(e) {
    const size = e.currentTarget.dataset.size;
    const temp = this.data.tempSettings;
    temp.fontSize = size;
    this.setData({ tempSettings: temp });
  },

  onModeChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.currentTarget.dataset.value;
    const temp = this.data.tempSettings;
    temp[field] = value;
    this.setData({ tempSettings: temp });
  },

  // 自定义数字键盘相关函数
  showCustomKeyboard(e) {
    const field = e.currentTarget.dataset.field;
    let title = '';
    
    // 根据字段设置键盘标题
    if (field === 'sendInterval') {
      title = '发送间隔(ms)';
    }
    
    // 获取当前字段的值
    const currentValue = this.data.tempSettings[field] || '';
    
    this.setData({
      showCustomKeyboard: true,
      keyboardTitle: title,
      currentInputField: field,
      currentInputValue: currentValue.toString()
    });
  },

  hideCustomKeyboard() {
    this.setData({
      showCustomKeyboard: false
    });
  },

  onKeyboardNumberTap(e) {
    const number = e.currentTarget.dataset.number;
    let currentValue = this.data.currentInputValue;
    
    // 限制输入长度，避免过长
    if (currentValue.length >= 6) {
      return;
    }
    
    // 拼接新的输入值
    currentValue += number;
    
    this.setData({
      currentInputValue: currentValue
    });
  },

  onKeyboardDeleteTap() {
    let currentValue = this.data.currentInputValue;
    
    // 删除最后一个字符
    if (currentValue.length > 0) {
      currentValue = currentValue.slice(0, -1);
    }
    
    this.setData({
      currentInputValue: currentValue
    });
  },

  onKeyboardClearTap() {
    this.setData({
      currentInputValue: ''
    });
  },

  onKeyboardConfirmTap() {
    const field = this.data.currentInputField;
    let value = this.data.currentInputValue;
    
    // 转换为数字，如果为空则默认为0
    value = parseInt(value) || 0;
    
    // 限制最小值，避免设置过小的间隔
    if (field === 'sendInterval') {
      value = Math.max(10, value); // 最小10ms
    }
    
    // 更新临时设置
    const temp = this.data.tempSettings;
    temp[field] = value;
    
    this.setData({
      tempSettings: temp,
      showCustomKeyboard: false
    });
  },

  closeSettings() {
    this.setData({ showSettings: false });
  },

  saveSettings() {
    this.setData({
      settings: this.data.tempSettings,
      showSettings: false
    });
    
    this.startSendLoop();
    wx.setStorage({
      key: 'userSettings',
      data: this.data.settings
    });
  },

  // --- Layout Customization ---
  toggleEditMode() {
    this.setData({ isEditMode: !this.data.isEditMode });
  },

  // Handle Drag & Pinch Scale
  onLayoutTouchStart(e) {
    if (!this.data.isEditMode) return;
    const key = e.currentTarget.dataset.key;
    const touches = e.touches;
    
    if (touches.length === 1) {
       // Drag Start
       this.dragState = {
         mode: 'drag',
         key: key,
         startX: touches[0].clientX,
         startY: touches[0].clientY,
         initialX: this.data.layout[key].x,
         initialY: this.data.layout[key].y
       };
    } else if (touches.length >= 2) {
       // Pinch Start
       const x1 = touches[0].clientX;
       const y1 = touches[0].clientY;
       const x2 = touches[1].clientX;
       const y2 = touches[1].clientY;
       const dist = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
       
       this.dragState = {
         mode: 'scale',
         key: key,
         startDist: dist,
         initialScale: this.data.layout[key].scale
       };
    }
  },

  onLayoutTouchMove(e) {
    if (!this.data.isEditMode || !this.dragState) return;
    const touches = e.touches;
    const key = this.dragState.key;
    
    // Check if mode changed (e.g. 1 finger -> 2 fingers)
    if (this.dragState.mode === 'drag' && touches.length >= 2) {
        // Switch to scale logic immediately or just ignore. 
        // Better to ignore or reset. Let's restart logic for simplicity:
        // just return to avoid jumpiness.
        return;
    }

    if (this.dragState.mode === 'drag' && touches.length === 1) {
      const dx = touches[0].clientX - this.dragState.startX;
      const dy = touches[0].clientY - this.dragState.startY;
      const newX = this.dragState.initialX + dx;
      const newY = this.dragState.initialY + dy;
      
      this.setData({
        [`layout.${key}.x`]: newX,
        [`layout.${key}.y`]: newY
      });
    } else if (this.dragState.mode === 'scale' && touches.length >= 2) {
       const x1 = touches[0].clientX;
       const y1 = touches[0].clientY;
       const x2 = touches[1].clientX;
       const y2 = touches[1].clientY;
       const dist = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
       
       if (this.dragState.startDist > 0) {
         const scale = this.dragState.initialScale * (dist / this.dragState.startDist);
         // Clamp scale
         const clamped = Math.max(0.5, Math.min(2.5, scale));
         this.setData({
           [`layout.${key}.scale`]: clamped
         });
       }
    }
  },

  onLayoutTouchEnd(e) {
    if (!this.data.isEditMode) return;
    // If all fingers lifted, reset state
    if (e.touches.length === 0) {
      this.dragState = null;
    }
  },

  saveLayout() {
    wx.setStorageSync('customLayout', this.data.layout);
    this.setData({ isEditMode: false });
    wx.showToast({ title: '布局已保存' });
  },

  restoreDefaultLayout() {
    // 清除保存的布局数据
    wx.removeStorageSync('customLayout');
    this.setData({
      layout: {
        leftJoystick: { x: 0, y: 0, scale: 1 },
        rightJoystick: { x: 0, y: 0, scale: 1 },
        buttons: { x: 0, y: 0, scale: 1 },
        leftButtons: { x: 0, y: 0, scale: 1 },
        rightButtons: { x: 0, y: 0, scale: 1 },
        logContainer: { x: 0, y: 0, scale: 1 },
        slider: { x: 0, y: 0, scale: 1 }
      }
    });
    wx.showToast({ title: '布局已重置' });
  },

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  // --- Slider Methods ---
  onSliderStart(e) {
    // 获取滑杆区域的位置信息
    const query = wx.createSelectorQuery();
    query.select('.slider-track').boundingClientRect();
    query.exec((res) => {
      if (res[0]) {
        this.data.sliderRect = res[0];
        this.updateSliderPosition(e.touches[0]);
      }
    });
  },

  onSliderMove(e) {
    if (!this.data.sliderRect) return;
    const touch = e.touches[0];
    this.updateSliderPosition(touch);
  },

  onSliderEnd(e) {
    // 触摸结束时的处理
    this.data.sliderRect = null;
  },

  updateSliderPosition(touch) {
    const rect = this.data.sliderRect;
    if (!rect) return;

    // 计算滑块位置百分比 (0-100)
    let position = ((touch.clientX - rect.left) / rect.width) * 100;
    position = this.clamp(position, 0, 100);

    // 更新滑块位置
    this.setData({
      sliderPosition: position
    });

    // 实时反馈当前状态（可以添加更多的反馈）
    console.log('滑杆位置:', position.toFixed(1) + '%');
  }
});
