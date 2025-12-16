# VHS Demo Tape for txex CLI
# Run with: vhs demo.tape

Output demo.gif

Set FontSize 14
Set Width 900
Set Height 500
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms
Set Padding 20

# Show help first
Type "txex --help"
Enter
Sleep 3s

# Clear and show version
Type "clear"
Enter
Sleep 500ms

Type "txex --version"
Enter
Sleep 1500ms

# Extract a BCAT chunked file (SHUAA - 9 chunks)
Type "txex fb3c1b442b352f6dcf503dcfa8ad274897184487f41928832858122c1e669da1_0 -o shuaa.mp4"
Enter
Sleep 15s

# Show the output file
Type "ls -lh shuaa.mp4"
Enter
Sleep 2s

# Clean up
Type "rm shuaa.mp4"
Enter
Sleep 1s
