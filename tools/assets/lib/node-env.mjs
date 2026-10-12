// Minimal browser shims so three.js exporters run under Node.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.({ target: this }); }); }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((r) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,` + Buffer.from(r).toString('base64');
      this.onloadend?.(); this.onload?.({ target: this });
    });
  }
};
globalThis.self ??= globalThis;
