# VHS Demo Tape for txex CLI
# Run with: vhs demo.tape

Output demo.gif

Set FontSize 14
Set Width 1000
Set Height 550
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 20

# Show version
Type "txex --version"
Enter
Sleep 1s

# Extract a 1Sat Ordinal (text/plain)
Type "txex 668fd698178715a2b8941e87a28b7ceb16bdb33656c8570e82d81ccebab3fdbb_0"
Enter
Sleep 4s

# Extract BCAT chunked file (video/mp4 - 9 chunks)
Type "txex fb3c1b442b352f6dcf503dcfa8ad274897184487f41928832858122c1e669da1_0 -o shuaa.mp4"
Enter
Sleep 12s

# Show the files
Type "ls -lh *.mp4 668fd698*"
Enter
Sleep 2s

# Show cache stats
Type "txex cache --stats"
Enter
Sleep 2s

# Clean up
Type "rm -f shuaa.mp4 668fd698* 2>/dev/null"
Enter
Sleep 500ms
