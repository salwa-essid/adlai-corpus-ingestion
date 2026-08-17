const { request } = require("playwright");

(async () => {
    const context = await request.newContext();
    const url =
        "https://misa.gov.sa/app/uploads/2024/08/Investment-Law.pdf";
    const response = await context.get(url);
    console.log("status:", response.status());
    console.log("content-type:", response.headers()["content-type"]);
    console.log("content-length:", response.headers()["content-length"]);
    const body = await response.body();
    console.log("downloaded bytes:", body.length);
    await require("fs").promises.writeFile(
        "./output/misa-test.pdf",
        body
    );

    console.log("saved: ./output/misa-test.pdf");

    await context.dispose();
})();