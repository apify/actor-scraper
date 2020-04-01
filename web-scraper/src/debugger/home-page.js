exports.renderHomePage = devtoolsUrl => `
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Apify Web Scraper Debugger</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="og:title" content="Apify Web Scraper Debugger">
    <meta property="og:description" content="Debug your cloud scraper as if it were running on your own machine.">
    <style>
        html {
            height: 100%;
        }
        body {
            margin: 0;
            font-family: "Courier", monospace;
            height: 100%
        }
        .overlay {
            position: fixed;
            left: 0;
            right: 0;
            top: 0;
            bottom: 0;
            flex-direction: column;
            flex-wrap: nowrap;
            align-items: center;
            justify-content: center;
            z-index: 100;
            background-color: rgba(44,44,44,0.2);
            display: flex;
            visibility: hidden;
        }
        .modal-window {
            border: 2px solid #E1E1E1;
            border-radius: 6px;
            padding: 2.4rem 3.2rem;
            background-color: #fff;
            min-width: 30rem;
        }
        header {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 2rem;
            border-bottom: 2px solid #E1E1E1;
            margin-bottom: 2rem;
        }
        .caption {
            font-size: 1.3rem;
            line-height: 1.3rem;
            font-weight: 900;
        }
        .close-button {
            height: 3rem;
            padding: 1rem;
            box-sizing: border-box;
            border-radius: 4px;
            background-color: #69c242;
            margin: 0 auto;
            display: block;
            color: white;
            font-size: 1rem;
        }
        .content {
            display: block;
            position: relative;
        }
    </style>
</head>
<body>
    <div class="overlay">
         <section class="modal-window">
             <header>
                 <span class="caption">
                    Next page ready
                 </span>
             </header>
             <div class="content">
                The page you were debugging closed, but there's a new page available:
                <p id="next-url">https://example.com</p> 
                <button class="close-button">Go to next page</button>
             </div>
          </section>
    </div>
    <iframe src="${devtoolsUrl}" style="border: 0; width: 100%; height: 100%;"></iframe>
    <script>
        const fetchJson = async url => fetch(url).then(res => res.json());
        
        const $nextModal = document.querySelector('div.overlay');
        const $nextButton = document.querySelector('.close-button');
        const $nextUrl = document.querySelector('#next-url');
        $nextButton.onclick = () => {
            $nextModal.style.visibility = 'hidden';
            window.location = '/';
        };
        
        let pageId;
        setInterval(async () => {
            const [page] = await fetchJson('/json/list');
            if (page.id !== pageId) {
                if (pageId) {
                    $nextUrl.textContent = page.url;
                    $nextModal.style.visibility = 'visible';           
                }
                pageId = page.id;
            }
        }, 1000)
    </script>
</body>    
</html>
`;
