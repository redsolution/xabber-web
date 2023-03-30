self.onmessage = (res) => {
    console.log(res.data);
    if (res.data.is_main){
        setInterval(() => {
            self.postMessage({is_main: res.data.is_main});
        }, 1000);
    }
    if (res.data.is_fast){
        setInterval(() => {
            self.postMessage({is_fast: res.data.is_fast});
        }, 1000);
    }
};