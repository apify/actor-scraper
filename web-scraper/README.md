# Leboncoin

This actor aims to **extract information from leboncoin.fr** using a Chromium browser and french Proxies. Data can be exported to various formats such as JSON or CSV. You have to option to **customise the information you want to extract** by modifying the javascript function which is executed on each page.

## How to Start

### 1 - Setup
- On your laptop, simply go to leboncoin and make a search, with all the filters you want, and location you want. Dont' forget to launch the search
![lbc_search](./assets/lbc_Search.gif)
- Then copy the URL of first page of search results, and paste it in the start-URL of this Actor.
![url1](./assets/url1.png)
- Update the field "Page suivante: how many times ?" to paginate deeper in the results.
- Get custom french proxy (See bellow for more details about Proxy) because leboncoin bans non-french request from its website
![lbc_search](./assets/apify_tuto.gif)

### 2 - Run & Download
- Click _Run_

Then wait for the result to appear in the "dataset" section and download them.


## Proxy

The **Proxy** option sets proxies used in order to prevent detection by leboncoin. It's compulsory to have french proxies since leboncoin bans foreign IPs. That's why you must choose "Custom Proxies" since every other option are not french ones. see <a href="https://apify.com/proxy">Apify Proxy</a>

The following table lists the available options of the proxy configuration setting:

<table class="table table-bordered table-condensed">
    <tbody>
    <tr>
        <th><b style="color:green">Custom&nbsp;proxies</b></td>
        <td>
            <p>
            The scraper will use a custom list of proxy servers. Proxies must be specified in the <code>scheme://user:password@host:port</code> format.
            <br>Note: multiple proxies should be separated by a space or new line. Scheme can be <code>http</code> or <code>socks5</code>. User & password are optional.
            </p>
            <p>
                Example: <pre><code class="language-none">http://groups-RESIDENTIAL,country-FR:balbalbalbaGNyTidoCZCfqg@proxy.apify.com:8000</code></pre>
            </p>
        </td>
    </tr>
        <tr>
        <th><b style="color:red"><s>None</s> [ban from leboncoin]</b></td>
        <td>
            The scraper will not use any proxies, and will have AWS IPs from the united states.
        </td>
    </tr>
    <tr>
        <th><b style="color:red"><s>Apify&nbsp;Proxy,&nbsp;automatic</s> [ban from leboncoin]</b></td>
        <td>
            The proxy uses all proxy groups that are available to the user, but none of them are french
        </td>
    </tr>
    <tr>
        <th><b style="color:red"><s>Apify&nbsp;Proxy,&nbsp;selected&nbsp;groups</s> [ban from leboncoin]</b></td>
        <td>
            The proxy uses specific groups, but none of them are french
        </td>
    </tr>
    </tbody>
</table>

## Advanced Configuration

- Respect URL pattern : you can ask the actor to follow only links with a specific Regex pattern. By default, it follows only <code>https://www.leboncoin.fr[.*]</code> to avoid going wild in the web !
- Max pages : it's a limit, to prevent the actor from crawling too many pages.
- Function : It's the function extracting the result on each leboncoin.fr pages. If the default is not enough for you, just update it using <a href="https://www.w3schools.com/jquery/jquery_ref_selectors.asp">jQuery selectors</a> to fetch other piece of information from leboncoin.fr !
