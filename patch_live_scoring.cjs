const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /\/\/ Sorare Direct Live Scoring API Endpoint\napp\.get\('\/api\/sorare\/live-scoring', async \(req, res\) => \{[\s\S]*?(?=\/\/ --------------------------------------------------------------------------------)/;

const newCode = `// Sorare Direct Live Scoring API Endpoint
const handleLiveScoring = async (req: express.Request, res: express.Response) => {
  const rawUsername = (req.body.username || req.query.username as string) || 'thib-8';
  const customApiKey = (req.body.apiKey || req.query.apiKey as string) || (req.headers['x-sorare-api-key'] as string) || process.env.SORARE_API_KEY || '';
  const slugsToFetch: string[] = req.body.slugs || [];
  const slug = cleanSlug(rawUsername);
  const startTime = Date.now();

  try {
    const hasApiKey = Boolean(customApiKey);
    const pageSize = hasApiKey ? 50 : 3;
    let allNodes: any[] = [];
    let hasNextPage = true;
    let endCursor: string | null = null;
    let fetchCount = 0;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TeamSorare-App/2.0',
    };
    if (customApiKey) {
      headers['APIKEY'] = customApiKey;
    }

    if (slugsToFetch && slugsToFetch.length > 0) {
      const playerQuery = \`
        query GetPlayerLiveScore($slug: String!) {
          player(slug: $slug) {
            id
            slug
            displayName
            playingStatus
            so5Scores(last: 3) {
              score
              decisiveScore { totalScore }
              allAroundStats { totalScore }
              game {
                id
                date
                statusTyped
                homeGoals
                awayGoals
                homeTeam { name pictureUrl }
                awayTeam { name pictureUrl }
              }
              playerGameStats {
                minsPlayed
                goals
                assists
                yellowCards
                redCards
              }
            }
          }
        }
      \`;
      
      for (const playerSlug of slugsToFetch) {
        if (!playerSlug) continue;
        const variables = { slug: playerSlug };
        const gqlResult = await fetchGraphQLWithRetry(
          'https://api.sorare.com/graphql',
          { query: playerQuery, variables },
          headers,
          2
        );
        if (gqlResult.ok && gqlResult.data?.data?.player) {
          allNodes.push({ anyPlayer: gqlResult.data.data.player });
        }
      }
    } else {
      const maxFetches = hasApiKey ? 15 : 35;
      const query = hasApiKey
        ? \`
          query GetLiveScoringDataApiKey($slug: String!, $after: String) {
            user(slug: $slug) {
              cards(first: \${pageSize}, after: $after, sport: FOOTBALL) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  anyPlayer {
                    ... on Player {
                      slug
                      playingStatus
                      so5Scores(last: 3) {
                        score
                        game { date statusTyped homeGoals awayGoals }
                      }
                    }
                  }
                }
              }
            }
          }
        \`
        : \`
          query GetLiveScoringData($slug: String!, $after: String) {
            user(slug: $slug) {
              cards(first: \${pageSize}, after: $after, sport: FOOTBALL) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  anyPlayer {
                    ... on Player {
                      slug
                      playingStatus
                      so5Scores(last: 3) {
                        score
                        game { date statusTyped homeGoals awayGoals }
                      }
                    }
                  }
                }
              }
            }
          }
        \`;

      while (hasNextPage && fetchCount < maxFetches) {
        fetchCount++;
        const variables: any = { slug };
        if (endCursor) variables.after = endCursor;
        const gqlResult = await fetchGraphQLWithRetry('https://api.sorare.com/graphql', { query, variables }, headers, 2);
        if (!gqlResult.ok || !gqlResult.data?.data) throw new Error('Erreur API Sorare');
        const cardsConnection = gqlResult.data.data.user?.cards;
        if (!cardsConnection) break;
        allNodes = allNodes.concat(cardsConnection.nodes || []);
        hasNextPage = cardsConnection.pageInfo?.hasNextPage;
        endCursor = cardsConnection.pageInfo?.endCursor;
      }
    }

    const liveScoresMap: Record<string, any> = {};
    for (const node of allNodes) {
      if (node?.anyPlayer?.slug && node.anyPlayer.so5Scores && node.anyPlayer.so5Scores.length > 0) {
        const sortedScores = [...node.anyPlayer.so5Scores].sort((a: any, b: any) => 
          new Date(b.game?.date || 0).getTime() - new Date(a.game?.date || 0).getTime()
        );
        const currentMatch = sortedScores[0];
        if (currentMatch && currentMatch.game) {
          liveScoresMap[node.anyPlayer.slug] = currentMatch;
        }
      }
    }

    res.json({
      success: true,
      liveScores: liveScoresMap,
      durationMs: Date.now() - startTime
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/sorare/live-scoring', handleLiveScoring);
app.post('/api/sorare/live-scoring', express.json(), handleLiveScoring);
\n`;

code = code.replace(regex, newCode);
fs.writeFileSync('server.ts', code);
console.log('Patched live scoring');
