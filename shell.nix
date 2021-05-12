# nix-env -f '<nixpkgs>' -qaPA nodePackages | grep lint

{ pkgs ? import <nixpkgs> {} } :
let
  # buildInputs = [ pkgs.nodePackages.eslint ];
  # buildInputs = [ pkgs.nodejs ];
  buildInputs = [ pkgs.haskellPackages.wai-app-static ];

in
  pkgs.mkShell {
    buildInputs = buildInputs;
    shellHook = ''
      echo "***"
      echo "*** Use warp to serve local files"
      echo "***"
    '';
  }
