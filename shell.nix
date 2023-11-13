{ pkgs ? import <nixpkgs> { } }:

with pkgs; mkShell {
  buildInputs = [ just nodejs yarn ];
  # shellHook = ''
  #   export PLAYWRIGHT_BROWSERS_PATH=${playwright-driver.browsers}
  #   export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
  #   export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  # '';
}
