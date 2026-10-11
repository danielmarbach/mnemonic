class MnemonicMcpPrerelease < Formula
  desc "Prerelease channel of mnemonic, the git-backed markdown MCP memory server"
  homepage "https://github.com/danielmarbach/mnemonic"
  url "https://registry.npmjs.org/@danielmarbach/mnemonic-mcp/-/mnemonic-mcp-1.0.0-rc.1.tgz"
  sha256 "0ce01ba112b3f15ac0887ed0fb3890c2f3ba44d3b1f3ae967ffee588af113f7a"
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
