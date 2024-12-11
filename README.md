# 股票小助手 Chrome 插件

<img width="576" alt="image" src="https://github.com/user-attachments/assets/2ee4d7ea-a49c-43d7-9e1f-4e48a25552c6">

https://github.com/user-attachments/assets/e55a9136-17f0-4c49-85a0-83f4db5ae286


## Features

* 无后台行为
* 插件使用最小权限(仅访问数据接口gtimg.cn) 
* 添加导出导入自选股功能
* 支持A 股、港股、美股

## Install

下载最新的 zip 文件后解压缩。
https://github.com/henices/stock-viewer/archive/refs/tags/1.9.2.zip

1. 设置 -> 拓展程序 打开右上角的 「开发者模式」
2. 左上角 「加载已解压的拓展程序」，选择前面下载后解压的 stock-viewer 文件夹

## FAQ

stock360的版本没有导出功能，用户要保留自选股数据，可在原插件的图标右键选择`检查弹出内容`，
在出现的调试窗口的`>`中运行`localStorage.getItem("stock_list")`，把输出的代码复制，粘贴到本插件的`导出导入`功能当中。
