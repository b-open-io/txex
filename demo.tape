# VHS Demo Tape for txex CLI
# Run with: vhs demo.tape

Output demo.gif

Set FontSize 14
Set Width 1000
Set Height 600
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 20

# Show version
Type "txex --version"
Enter
Sleep 1s

# Extract a 1Sat Ordinal image
Type "txex 6fecd063d7155b3080fa8df5e2990290c61c7af05e95ed0a3b8b75a35f5d1a80_0"
Enter
Sleep 8s

# Show the extracted file
Type "ls -lh *.png"
Enter
Sleep 2s

# Now transform: resize to 400px width, convert to WebP
Type "txex 6fecd063d7155b3080fa8df5e2990290c61c7af05e95ed0a3b8b75a35f5d1a80_0 -w 400 -f webp"
Enter
Sleep 6s

# Show both files
Type "ls -lh 6fecd063*"
Enter
Sleep 2s

# Run same transform again - instant from cache
Type "txex 6fecd063d7155b3080fa8df5e2990290c61c7af05e95ed0a3b8b75a35f5d1a80_0 -w 400 -f webp"
Enter
Sleep 2s

# Show cache stats
Type "txex cache --stats"
Enter
Sleep 3s

# Clean up
Type "rm 6fecd063*.png 6fecd063*.webp 2>/dev/null"
Enter
Sleep 500ms
