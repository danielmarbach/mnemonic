class MnemonicMcpPrerelease < Formula
  desc "Prerelease channel of mnemonic, the git-backed markdown MCP memory server"
  homepage "https://github.com/danielmarbach/mnemonic"
  url "https://registry.npmjs.org/@danielmarbach/mnemonic-mcp/-/mnemonic-mcp-1.0.0.tgz"
  sha256 "6406130b9f8199c5cab7c2b1f7702a62eed582accaa81fb1315837ff01dc64ad"
  license "Apache-2.0"

  depends_on "node"

  conflicts_with "mnemonic-mcp", because: "both install the mnemonic binary"

  def install
    system "#{Formula["node"].opt_bin}/npm", "install", "--omit=dev", "--ignore-scripts"
    libexec.install Dir["*"]
    (bin/"mnemonic").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/build/index.js" "$@"
    EOS
    chmod 0755, bin/"mnemonic"
  end

  test do
    assert_match "Mnemonic Migration Tool", shell_output("#{bin}/mnemonic migrate --help")
  end
end
