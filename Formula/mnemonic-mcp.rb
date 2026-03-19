class MnemonicMcp < Formula
  desc "Local MCP memory server backed by markdown + JSON files, synced via git"
  homepage "https://github.com/danielmarbach/mnemonic"
  url "https://registry.npmjs.org/@danielmarbach/mnemonic-mcp/-/mnemonic-mcp-0.13.0.tgz"
  sha256 "d58db2841a8b291e56351490d9d1c04ab71f63cb026e04d33a7bcd8ac6c29c1d"
  license "Apache-2.0"

  depends_on "node"

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
