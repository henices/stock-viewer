# 股票小助手 Chrome 插件

## Features

* 无后台行为
* 插件使用最小权限(仅访问数据接口gtimg.cn) 
* 添加导出导入自选股功能
* 支持A 股、港股、美股

## Install

git clone https://github.com/henices/stock-viewer.git

1. 设置 -> 拓展程序 打开右上角的 「开发者模式」
2. 左上角 「加载已解压的拓展程序」，选择前面下载的 stock-viewer 文件夹

## FAQ

stock360的版本没有导出功能，用户要保留自选股数据，可在原插件的图标右键选择`检查弹出内容`，
在出现的调试窗口的`>`中运行`localStorage.getItem("stock_list")`，把输出的代码复制，粘贴到本插件的`导出导入`功能当中。
