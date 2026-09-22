Option Explicit

Dim shell, command, index
Set shell = CreateObject("WScript.Shell")

command = ""
For index = 0 To WScript.Arguments.Count - 1
  command = command & """" & WScript.Arguments(index) & """ "
Next

If Len(command) > 0 Then shell.Run command, 0, False
