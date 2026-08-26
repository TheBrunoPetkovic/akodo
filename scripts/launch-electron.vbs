Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Pookies\Desktop\dev\akodo"
WshShell.Environment("Process")("NODE_ENV") = "development"
WshShell.Run "node_modules\.bin\electron.cmd . --no-sandbox", 0, False
