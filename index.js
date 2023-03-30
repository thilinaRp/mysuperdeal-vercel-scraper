const app = require("express")();

let chrome = {};
let puppeteer;

if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
  chrome = require("chrome-aws-lambda");
  puppeteer = require("puppeteer-core");
} else {
  puppeteer = require("puppeteer");
}

app.get("/api/:pageId", async (req, res) => {
  let options = {};

  if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    options = {
      args: [...chrome.args, "--hide-scrollbars", "--disable-web-security"],
      defaultViewport: chrome.defaultViewport,
      executablePath: await chrome.executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    };
  }
  let browser = await puppeteer.launch(options);
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (
        // request.resourceType() === "image" ||
        // request.resourceType() === "stylesheet"
        request.resourceType() === "font"
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });
    await page.goto(`https://m.facebook.com/ ${req.params.pageId}/`, {
      waitUntil: "networkidle2",
      timeout: 0,
    });

    // scoll page
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    // wait for first post to view

    await page
      .waitForXPath('//*[@id="pages_msite_body_contents"]/div/div[4]/div[2]', {
        timeout: 0,
      })
      .then(() => {
        console.log("post loaded");
      });

    // get posts html list
    const posts = await page.evaluate(() => {
      const postList = document.querySelectorAll(
        '#pages_msite_body_contents > div > div:nth-child(4) > div[style="padding-top:8px"]'
      );
      const postlistarray = [];
      postList.forEach((el) => {
        postlistarray.push(el.innerHTML);
      });

      return postlistarray;
    });
    const postObjectArray = posts.map((post) => {
      const $ = cheerio.load(post);
      const postObject = JSON.parse($("article").attr("data-ft"));
      const postId = postObject.mf_story_key;
      const postImgId = postObject.photo_id;
      const publishDateSecond =
        postObject.page_insights[`${postObject.page_id}`].post_context
          .publish_time;

      const postDescription = $(".story_body_container > div > div").html();
      // const desStyleRemove = cheerio.load(postDescription);
      // desStyleRemove("style").remove();
      // desStyleRemove("*[style]").removeAttr("style");
      // desStyleRemove("*[class]").removeAttr("class");
      // desStyleRemove("span").removeAttr();
      // const description = desStyleRemove("body").html();
      const postImageLow = $(".story_body_container div a img")
        .eq(1)
        .attr("src");
      const postUrl = $(".story_body_container div div a").eq(2).attr("href");

      const postDataObject = {
        postId: postId,
        imgId: postImgId,
        publishDate: publishDateSecond,
        description: postDescription,
        lowQImgUrl: postImageLow,
        postUrl: postUrl,
      };
      return postDataObject;
    });
    res.send(postObjectArray);
  } catch (err) {
    res.send(`process error ${e}`);
  } finally {
    await browser.close();
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});

module.exports = app;
