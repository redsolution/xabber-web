self.onmessage = () => {
    setInterval(() => {
        self.postMessage({});
    }, 1000);
};