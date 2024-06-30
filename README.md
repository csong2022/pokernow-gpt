
<a id="readme-top"></a>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#license">License</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

A poker bot designed for [PokerNow](https://www.pokernow.club) using ChatGPT to make decisions.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

Node.js
Express
Puppeteer
SQLite

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

### Installation

1. Get an Open AI API Key at [(https://platform.openai.com/)](https://platform.openai.com/)
2. Clone the repo
   ```sh
   git clone https://github.com/csong2022/pokernow-gpt.git
   ```
3. Install NPM packages
   ```sh
   npm install
   ```
4. Create a .env file and enter your API Key
   ```js
   const OPENAI_API_KEY = 'YOUR API KEY';
   ```
5. Run the app
   ```sh
   npx tsx app/index.ts
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>
