{
  description = "node devshell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = [
          pkgs.nodejs_24
          pkgs.typescript
          pkgs.playwright-driver.browsers
					# check the playwright nix version with:
          # nix eval --raw nixpkgs#playwright-driver.version 2>/dev/null
         
          # and make sure to install the save version with package.json:
					# eg. if the above return 1.57.0, make sure to have in package.json: 
          # 
          # "@playwright/test": "1.57.0",
          # "playwright": "1.57.0",

          # pkgs.nodePackages.pnpm
        ];
        shellHook = ''
          export PATH="$PWD/node_modules/.bin:$PATH"
          corepack enable >/dev/null 2>&1 || true
          export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
          export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true;
        '';
      };
    };
}

