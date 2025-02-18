if (!self.onmessage){
    self.onmessage = () => {
        setInterval(() => {
            self.postMessage({});
        }, 1000);
    };
}