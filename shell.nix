# nix-env -f '<nixpkgs>' -qaPA nodePackages | grep lint

{ pkgs ? import <nixpkgs> {} } :
let
  # buildInputs = [ pkgs.nodePackages.eslint ];
  buildInputs = [ pkgs.nodejs ];

in
  pkgs.mkShell {
    buildInputs = buildInputs;
  }
