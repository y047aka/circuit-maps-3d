{
  description = "Circuit maps from OpenStreetMap: one surveyed GeoJSON per circuit, with heights, and the pipeline that lays them";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-26.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        flix = pkgs.flix.overrideAttrs (old: rec {
          version = "0.79.0";
          src = pkgs.fetchurl {
            url = "https://github.com/flix/flix/releases/download/v${version}/flix.jar";
            hash = "sha256-j60qoJVnp+2rzEP0EB+mGZEx3ywikp4AHIdlnXZPbc8=";
          };
        });

        # `flix` has to be started where `flix.toml` is, while a reader names paths
        # from wherever they stand: `GEOMETRY_FROM` is that directory, and
        # `Util/Files.flix` resolves every path against it.
        mkGeometryApp = name: runtimeInputs: cmd:
          pkgs.writeShellApplication {
            inherit name;
            runtimeInputs = [ flix pkgs.git ] ++ runtimeInputs;
            text = ''
              export GEOMETRY_FROM="$PWD"
              cd "$(git rev-parse --show-toplevel)"
              ${cmd}
            '';
          };

        geometryApp = mkGeometryApp "geometry" [ ] ''flix run -- "$@"'';

        # `flix test` reads fixtures; `check-sources.mjs` reads the project's own
        # sources for the facts no pure @Test can reach.
        testApp = mkGeometryApp "test" [ pkgs.nodejs_26 ] "flix test && node test/check-sources.mjs";

        # Every kept answer re-surveyed against the published bytes, never with
        # `--write`: a fence that rewrites what it fences passes by construction.
        fenceApp = mkGeometryApp "fence" [ ] ''
          words=$(find circuits -mindepth 2 -maxdepth 2 -name overpass.json | cut -d/ -f2 | sort)
          for word in $words; do
            flix run -- survey "$word"
          done
          flix run -- regenerate
        '';

        # What a consumer reads: the geometries, and each circuit's spec laid
        # out flat beside them as `specs/<word>.json`.
        data = pkgs.runCommand "circuit-maps-3d-data" { } ''
          mkdir -p $out/specs
          cp -r ${./geometry} $out/geometry
          for dir in ${./circuits}/*/; do
            word=$(basename "$dir")
            cp "$dir/spec.json" "$out/specs/$word.json"
          done
        '';

      in {
        packages.default = data;

        devShells.default = pkgs.mkShell {
          buildInputs = [ flix pkgs.nodejs_26 ];
        };

        apps = {
          geometry = { type = "app"; program = "${geometryApp}/bin/geometry"; meta.description = "The geometry pipeline, one word at a time: survey | diff | regenerate | elevation | probe (paths resolve from where the command is run)"; };
          test     = { type = "app"; program = "${testApp}/bin/test";         meta.description = "flix test, then test/check-sources.mjs: no network, no files written"; };
          fence    = { type = "app"; program = "${fenceApp}/bin/fence";       meta.description = "Re-survey every kept Overpass answer and fail unless it reproduces the published geometry"; };
        };
      });
}
