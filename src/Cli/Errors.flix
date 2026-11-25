/// What the commands say when a file goes wrong: the file they could not read or
/// write, and what a reading found wrong with bytes that did arrive.
/// The read and the writing here are the reporting; a run that *branches* on a
/// missing file — deciding a circuit was never surveyed, say — asks `Util.Files`'
/// `exists` or `isDirectory` first, because the branch is a verdict and not a
/// sentence, and a read's own failure cannot tell a missing file from one that
/// would not read.
///
/// `Read` and `Write` carry the path as the reader named it; `Util.Files` resolves it
/// against `GEOMETRY_FROM`.
pub mod Cli.Errors {

    pub enum CliError {
        case Read({ path = String, message = String })
        case Write({ path = String, message = String })
        case Reading(String)
    }

    instance ToString[CliError] {
        pub def toString(e: CliError): String = match e {
            case CliError.Read(r)              => "Failed to read ${r#path} (caused by: ${r#message})"
            case CliError.Write(w)             => "Failed to write ${w#path} (caused by: ${w#message})"
            // What a reading found wrong with the data it was handed: no file's fault.
            case CliError.Reading(problem)     => problem
        }
    }

    /// A file read, and a file written: the name the reader gave rides along with
    /// what the filesystem said, once. What a reading found wrong with bytes that
    /// did arrive is `Reading`, not these; and a run that branches on the failure
    /// rather than reporting it — deciding a circuit was never surveyed, say —
    /// asks `Util.Files` directly.
    pub def readFile(path: String): Result[CliError, String] \ IO =
        Util.Files.read(path) |>
            Result.mapErr(problem -> CliError.Read({path = path, message = problem}))

    pub def writeFile(path: String, text: String): Result[CliError, Unit] \ IO =
        Util.Files.write(path, text) |>
            Result.mapErr(problem -> CliError.Write({path = path, message = problem}))

}
