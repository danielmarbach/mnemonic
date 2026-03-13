class Mnemonic < Formula
  desc "Local MCP memory server backed by markdown + JSON files, synced via git"
  homepage "https://github.com/danielmarbach/mnemonic"
  url "https://registry.npmjs.org/@danielmarbach/mnemonic-mcp/-/mnemonic-mcp-0.7.0.tgz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000" # updated automatically by the publish workflow
  license "Apache-2.0"

  depends_on "node"

  def install
    system "#{Formula["node"].opt_bin}/npm", "install", "--omit=dev", "--ignore-scripts"
    libexec.install Dir["*"]
    (bin/"mnemonic").write_env_script "#{Formula["node"].opt_bin}/node",
                                      "#{libexec}/build/index.js"
  end

  test do
    assert_match "Mnemonic Migration Tool", shell_output("#{bin}/mnemonic migrate --help")
  end
end
