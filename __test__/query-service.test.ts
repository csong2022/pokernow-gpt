// Creating query service
import { fetchData, getCreatedAt, getData, getMsg, getLast, getFirst } from '../app/services/log-service.ts';

const testArray = [
    ['bmrA62QMH-', 'paul', 'posts', 'posts a big blind of 20 and go all in', '20'],
    ['hjf1Arb46X', 'jep', 'posts', 'posts a small blind of 10', '10']
];

function generatePrompt(logs: Array<Array<string>>): string{ 
    // Get the logs in a designed format
    const formattedLogs = logs.map(log => `ID ${log[0]} User ${log[1]} ${log[2]} ${log[3]}.`);
    const combinedLogs = formattedLogs.join(' ');

    // After last log propose a question
    const lastLog = logs[logs.length - 1];
    const question = `What should ID ${lastLog[0]} User ${lastLog[1]} do?`;

    return `${combinedLogs} ${question}`
}

const prompt = generatePrompt(testArray);
console.log(prompt)