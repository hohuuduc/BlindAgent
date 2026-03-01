const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const skillsDir = path.join(__dirname, 'skills');
const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));

let allValid = true;

for (const file of files) {
    const content = fs.readFileSync(path.join(skillsDir, file), 'utf8');

    // Extract YAML frontmatter
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
        console.error(`❌ [${file}] No YAML frontmatter found.`);
        allValid = false;
        continue;
    }

    try {
        const doc = yaml.load(match[1]);

        // Check nodes and edge targets
        if (!doc.nodes || !Array.isArray(doc.nodes)) {
            console.error(`❌ [${file}] No nodes array found.`);
            allValid = false;
            continue;
        }

        const nodeIds = new Set(doc.nodes.map(n => n.id));
        let fileValid = true;

        for (const node of doc.nodes) {
            if (!node.id) {
                console.error(`❌ [${file}] A node is missing an id.`);
                fileValid = false;
            }
            if (node.edges && Array.isArray(node.edges)) {
                for (const edge of node.edges) {
                    if (!edge.target) {
                        console.error(`❌ [${file}] Node '${node.id}' has an edge without a target.`);
                        fileValid = false;
                    } else if (!nodeIds.has(edge.target)) {
                        console.error(`❌ [${file}] Node '${node.id}' points to non-existent target '${edge.target}'.`);
                        fileValid = false;
                    }
                }
            }
        }

        if (fileValid) {
            console.log(`✅ [${file}] YAML parsed successfully and all edge targets are valid.`);
        } else {
            allValid = false;
        }

    } catch (e) {
        console.error(`❌ [${file}] Failed to parse YAML: ${e.message}`);
        allValid = false;
    }
}

if (!allValid) {
    process.exit(1);
}
console.log("All skills validated successfully!");
