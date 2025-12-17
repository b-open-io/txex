# VHS Demo - Collection Download
# Run with: vhs demo-collections.tape

Output demo-collections.gif

Set FontSize 14
Set Width 900
Set Height 400
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Padding 20
Set Shell zsh
Env PATH "/Users/satchmo/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Download a collection with limit
Type "txex df8a277aa03b595f6e50b576093ef6fc039a83635b2325640fce6c8d27f9edb5_0 --limit 10"
Enter
Sleep 15s

# Show what we got
Type "ls -la 'Cyber Apes'"
Enter
Sleep 2s

# Clean up
Type "rm -rf 'Cyber Apes'"
Enter
Sleep 500ms
