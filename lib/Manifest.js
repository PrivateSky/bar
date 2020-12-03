const MANIFEST_PATH = "/manifest";

function Manifest(archive, callback) {
    const pskPath = require("swarmutils").path;
    let manifest;
    let temporary = {};
    let manifestHandler = {};


    manifestHandler.mount = function (path, archiveIdentifier, options, callback) {
        if (typeof options === "function") {
            callback = options;
            options = {persist: true};
        }

        if (typeof options === "undefined") {
            options = {persist: true};
        }
        // if (/\W-_/.test(name) === true) {
        //     return callback(Error("Invalid mount name"));
        // }

        for (let mountingPoint in manifest.mounts) {
            if (pskPath.isSubpath(path, mountingPoint) || pskPath.isSubpath(path, mountingPoint)) {
                return callback(Error(`Mount not allowed. Already exist a mount for ${mountingPoint}`));
            }
        }

        manifest.mounts[path] = archiveIdentifier;
        if (options.persist === true) {
            return persist(callback);
        } else {
            temporary[path] = true;
        }

        callback(undefined);
    };

    manifestHandler.unmount = function (path, callback) {
        if (typeof manifest.mounts[path] === "undefined") {
            return callback(Error(`No mount found at path ${path}`));
        }

        delete manifest.mounts[path];

        if (temporary[path]) {
            delete temporary[path];
        } else {
            persist(callback);
        }
    };

    manifestHandler.getArchiveIdentifier = function (path, callback) {
        if (typeof manifest.mounts[path] === "undefined") {
            return callback(Error(`No mount found at path ${path}`));
        }

        callback(undefined, manifest.mounts[path]);
    };

    manifestHandler.getArchiveForPath = function (path, callback) {
        if (path[0] !== '/') {
            path = `/${path}`;
        }
        for (let mountingPoint in manifest.mounts) {
            if (mountingPoint === path) {
                return getArchive(manifest.mounts[mountingPoint], (err, archive) => {
                    if (err) {
                        return callback(err);
                    }

                    return callback(undefined, {prefixPath: mountingPoint, relativePath: "/", archive: archive, identifier: manifest.mounts[mountingPoint]});
                });
            }

            if (pskPath.isSubpath(path, mountingPoint)) {
                return getArchive(manifest.mounts[mountingPoint], (err, archive) => {
                    if (err) {
                        return callback(err);
                    }

                    let remaining = path.substring(mountingPoint.length);
                    remaining = pskPath.ensureIsAbsolute(remaining);
                    return archive.getArchiveForPath(remaining, function (err, result) {
                        if (err) {
                            return callback(err);
                        }
                        result.prefixPath = pskPath.join(mountingPoint, result.prefixPath);
                        callback(undefined, result);
                    });
                });
            }
        }

        callback(undefined, {prefixPath: "/", relativePath: path, archive: archive});
    };

    manifestHandler.getMountPoints = function () {
        return Object.keys(manifest.mounts);
    }

    manifestHandler.getMountedDossiers = function (path, callback) {
        let mountedDossiers = [];
        for (let mountPoint in manifest.mounts) {
            if (pskPath.isSubpath(mountPoint, path)) {
                let mountPath = mountPoint.substring(path.length);
                if (mountPath[0] === "/") {
                    mountPath = mountPath.substring(1);
                }
                mountedDossiers.push({
                    path: mountPath,
                    identifier: manifest.mounts[mountPoint]
                });
            }
        }

        const mountPaths = mountedDossiers.map(mountedDossier => mountedDossier.path);
        mountedDossiers = mountedDossiers.filter((mountedDossier, index) => {
            return mountPaths.indexOf(mountedDossier.path) === index;
        });

        callback(undefined, mountedDossiers);
    };

    function getArchive(seed, callback) {
        const resolver = require("opendsu").loadApi("resolver");

        resolver.loadDSU(seed, (err, dossier) => {
            if (err) {
                return callback(err);
            }
            callback(undefined, dossier);
        })
    }

    function persist(callback) {
        archive.writeFile(MANIFEST_PATH, JSON.stringify(manifest), callback);
    }

    function init(callback) {
        archive.readFile(MANIFEST_PATH, {ignoreMounts: true}, (err, manifestContent) => {
            if (err) {
                manifest = {mounts: {}};
            } else {
                try {
                    manifest = JSON.parse(manifestContent.toString());
                } catch (e) {
                    return callback(e);
                }
            }

            callback(undefined, manifestHandler);
        });
    }

    init(callback);
}

module.exports.getManifest = function getManifest(archive, callback) {
    Manifest(archive, callback);
};

