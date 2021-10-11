# Leboncoin

This actor aims to extract information from leboncoin.fr using a Chromium browser and french Proxies. Data can be exported to various formats such as JSON or CSV.

## How to Start
- On your laptop, simply go to leboncoin and make a search, with all the filters you want, and location you want. 
- Then copy the URL of first page of search results, and paste it in the start-URL of this Actor.
- Because leboncoin bans non-french request from its website, you will need to get custom french proxy (See bellow for more details about Proxies). Enter your french proxy IPs in the Proxy section

✅ You are good to go !


## Proxy

The **Proxy configuration** (`proxyConfiguration`) option enables you to set proxies that will be used by the scraper in order to prevent its detection by target websites.
You can use both [Apify Proxy](https://apify.com/proxy) as well as custom HTTP or SOCKS5 proxy servers.

The following table lists the available options of the proxy configuration setting:

<table class="table table-bordered table-condensed">
    <tbody>
    <tr>
        <th><b>None [won't work]</b></td>
        <td>
            The scraper will not use any proxies.
            All web pages will be loaded directly from IP addresses of Apify servers running on Amazon Web Services.
        </td>
    </tr>
    <tr>
        <th><b>Apify&nbsp;Proxy,&nbsp;automatic [won't work]</b></td>
        <td>
            The proxy uses all proxy groups that are available to the user, and for each new web page it automatically selects the proxy
            that hasn't been used in the longest time for the specific hostname, in order to reduce the chance of detection by the website.
        </td>
    </tr>
    <tr>
        <th><b>Apify&nbsp;Proxy,&nbsp;selected&nbsp;groups[won't work]</b></td>
        <td>
            The scraper will load all web pages using <a href="https://apify.com/proxy">Apify Proxy</a>
            with specific groups of target proxy servers.
        </td>
    </tr>
    <tr>
        <th><b style="color:red">Custom&nbsp;proxies</b></td>
        <td>
            <p>
            The scraper will use a custom list of proxy servers.
            The proxies must be specified in the <code>scheme://user:password@host:port</code> format,
            multiple proxies should be separated by a space or new line.
            The URL scheme can be either <code>http</code> or <code>socks5</code>.
            User and password might be omitted, but the port must always be present.
            </p>
            <p>
                Example:
            </p>
            <pre><code class="language-none">http://bob:password@proxy1.example.com:8000
http://bob:password@proxy2.example.com:8000</code></pre>
        </td>
    </tr>
    </tbody>
</table>
