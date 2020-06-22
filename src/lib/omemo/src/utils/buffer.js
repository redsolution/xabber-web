export default new class {
    /**
    * Take a buffer and convert it to a Uint8Array. Thanks to Martin Thomson:
    * http://stackoverflow.com/a/12101012
    *
    * @param {Buffer} buffer - The buffer to be converted.
    * @return {Uint8Array} view - The new Uint8Array.
    */
    toTypedArray (buffer) {
        var ab = new ArrayBuffer(buffer.length)
        var view = new Uint8Array(ab)

        for (var i = 0; i < buffer.length; ++i) {
            view[i] = buffer[i]
        }

        return view
    }
}
