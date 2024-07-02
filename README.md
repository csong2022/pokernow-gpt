## PokerNow GPT

<a id="readme-top"></a>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
       <ul>
        <li><a href="#why-chatgpt-over-gto">Why ChatGPT over GTO?</a></li>
       </ul>
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
    <li>
      <a href="#supported-models">Supported Models</a>
    </li>
    </li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

A Poker bot designed for [PokerNow](https://www.pokernow.club) using ChatGPT (or other models! check the Supported Models section below) to make decisions for the user. The bot web scrapes and fetches logs from PokerNow, building a model of the live game: the stakes, the user's hole cards, every player's position and stack size, the current pot size, the current street and shown community cards, and previous actions made by the the bot and other players. 

This model is used to formulate a query, fed into an LLM model. The output is parsed to reach a decision for the user, which is then executed automatically by the webdriver. The history of queries is maintained across a single hand and passed back into the model so that it can "remember" previous actions, such as who was the preflop aggressor.

During the operation of the bot, a cache is maintained to track the stats of every player in the table (VPIP, PFR). After the session ends, a SQLite database is updated with the players' stats, tracked by the player's name. This data will be retrieved the next time the user plays against that opponent again, building a stronger model of the opponent's tendencies the more the user plays against them. Each player's stats are used in the query, allowing the bot to make personalized exploitative adjustments to its strategy.

### Why ChatGPT (or other LLMs) over GTO?

A common question that is asked is why would someone use an LLM to determine the best possible actions over GTO strategy (Game Theory Optimal)? GTO strategies are generally considered a "perfect" way to play poker, with a balanced, aggressive, and unexploitable strategy.

GTO strategies are mostly solved for heads-up play (2 players) and has fewer data on how a hand should be played multi-handed (3+ players). As you increase the number of players participating in the pot, it becomes harder to follow an optimal strategy created for 2 or 3 players max. Weaker tables found online can have many loose players, increasing the chance of pots going multi-way postflop.

Furthermore, GTO strategies generally can't make use of opponents' VPIP (voluntary put money in pot) and PFR (pre-flop raise) stats to make exploitative adjustments to its strategy. One could argue that while GTO would perform the best against another bot using GTO or a human playing as close to GTO as possible, an agent utilizing an LLM could generate more profit against weaker opponents that stray far from GTO.

As ChatGPT and LLMs/generative models as a whole improve over time, we can and should expect ChatGPT to become a stronger, more profitable poker player.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

* [Node][Node-url]
* [Express][Express-url]
* [Puppeteer][Puppeteer-url]
* [SQLite][SQLite-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

### Installation

1. Get an Open AI API Key at [(https://platform.openai.com/docs/overview)](https://platform.openai.com/docs/overview)
2. Clone the repo
   ```sh
   git clone https://github.com/csong2022/pokernow-gpt.git
   ```
3. Install NPM packages
   ```sh
   npm install
   ```
4. Create a .env file in the base project directory ./pokernow-gpt and define your API Key
   ```js
   OPENAI_API_KEY = 'YOUR API KEY';
   GOOGLEAI_API_KEY = 'YOUR API KEY';
   ```
5. Update app/configs/ai-config.json to your desired provider and model_name (see supported models below for reference)
   ```json
   {
     "provider": "PROVIDER",
     "model_name": "MODEL"
   }
   ```
6. Run the app
   ```sh
   npx tsx app/index.ts
   ```
7. Follow the command line prompts to join an existing PokerNow game as a player. (ensure that the game is already setup with another player being the host)
<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- SUPPORTED MODELS -->
## Supported Models
providers
---
"OpenAI", "Google"

models
---
OpenAI: "gpt-3.5-turbo", "gpt-4-turbo", "gpt-4o"

Google: "gemini-1.5-flash", "gemini-1.0-pro", "gemini-1.5-pro"

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

pokernowgpt@gmail.com

Project Link: [https://github.com/csong2022/pokernow-gpt](https://github.com/csong2022/pokernow-gpt)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[Node-url]: https://nodejs.org/en
[Express-url]: https://expressjs.com/
[Puppeteer-url]: https://pptr.dev/
[SQLite-url]: https://www.sqlite.org/
