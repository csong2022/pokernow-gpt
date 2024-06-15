// Creating query service
import { fetchData, getCreatedAt, getData, getMsg, getLast, getFirst } from '../app/services/log-service.ts';

const testArray = [
    ['bmrA62QMH-', 'paul', 'posts', 'posts a big blind of 20 and go all in', '20'],
    ['hjf1Arb46X', 'jep', 'posts', 'posts a small blind of 10', '10']
];

const idDict = {
    'bmrA62QMH-': 'SB', 
    '3so3OqbMfo': 'BB', 
    'hjf1Arb46X': 'BU'
}

function generatePrompt(logs: Array<Array<string>>, idDictionary: Record<string, string>): string { 
    // Get the logs in a designed format
    const formattedLogs = logs.map(log => {
        const position = idDictionary[log[0]] ? ` in the ${idDictionary[log[0]]}` : '';
        return `ID ${log[0]} User ${log[1]}${position} ${log[2]} ${log[3]}.`;
    });
    const combinedLogs = formattedLogs.join(' ');

    // After last log propose a question
    const lastLog = logs[logs.length - 1];
    const lastPosition = idDictionary[lastLog[0]] ? ` in the ${idDictionary[lastLog[0]]}` : '';
    const question = `What should ID ${lastLog[0]} User ${lastLog[1]}${lastPosition} do?`;

    return `${combinedLogs} ${question}`;
}

test('test query format', async () => {
    const prompt = generatePrompt(testArray, idDict);
    console.log(prompt)
})
