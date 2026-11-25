/// A circuit's spec — the figures its series' circuit map publishes — read from the
/// circuit's own directory, for the commands that lay a geometry from it. What the spec
/// says is `Circuit.figuresOf`'s to read; this is the file.
pub mod Spec {

    use Circuit.Circuit
    use Circuit.Figures

    /// The figures of a circuit's spec, or the sentence naming the file that would not
    /// give them.
    pub def read(circuit: Circuit): Result[String, Figures] \ IO =
        let path = Circuit.specOf(circuit);
        Cli.Errors.readFile(path)
            |> Result.mapErr(problem -> "${problem}")
            |> Result.flatMap(text -> Circuit.figuresOf(text) |> Result.mapErr(problem -> "${path}: ${problem}"))

}
