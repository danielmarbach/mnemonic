class MnemonicMcp < Formula
  desc "Local MCP memory server backed by markdown + JSON files, synced via git"
  homepage "https://github.com/danielmarbach/mnemonic"
  url "https://registry.npmjs.org/@danielmarbach/mnemonic-mcp/-/mnemonic-mcp-0.30.0.tgz"
  sha256 "0b8b16daacd20f01d80fe40d9f1bc7d6bbfbe92b151f8a3ae27df74833fe15a6"
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
