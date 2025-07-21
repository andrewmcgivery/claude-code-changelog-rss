#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const RSS = require('rss');
const { marked } = require('marked');

const CLAUDE_CODE_REPO = 'claude-code';
const CHANGELOG_PATH = path.join(CLAUDE_CODE_REPO, 'CHANGELOG.md');
const OUTPUT_FILE = 'public/claude-code-changelog.xml';

function parseChangelog(content) {
  const lines = content.split('\n');
  const versions = [];
  let currentVersion = null;
  let currentContent = [];

  for (const line of lines) {
    // Check if this is a version header (## 1.0.54)
    const versionMatch = line.match(/^## (\d+\.\d+\.\d+)/);
    
    if (versionMatch) {
      // Save previous version if exists
      if (currentVersion) {
        versions.push({
          version: currentVersion,
          content: currentContent.join('\n').trim()
        });
      }
      
      // Start new version
      currentVersion = versionMatch[1];
      currentContent = [];
    } else if (currentVersion && line.trim()) {
      // Add content to current version (skip empty lines at start)
      if (currentContent.length > 0 || line.trim()) {
        currentContent.push(line);
      }
    }
  }

  // Don't forget the last version
  if (currentVersion) {
    versions.push({
      version: currentVersion,
      content: currentContent.join('\n').trim()
    });
  }

  return versions;
}

function getVersionDate(version) {
  try {
    // Use git blame on the changelog file to find when the version line was added
    const blameCmd = `cd ${CLAUDE_CODE_REPO} && git blame --date=iso CHANGELOG.md | grep "## ${version}" | head -1 | awk '{print $3, $4}'`;
    const blameResult = execSync(blameCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    
    if (blameResult && blameResult !== '') {
      return new Date(blameResult);
    }

    // Fallback: use current date
    return new Date();
  } catch (error) {
    console.warn(`Could not determine date for version ${version}, using current date`);
    return new Date();
  }
}

function generateRSS(versions) {
  const feed = new RSS({
    title: 'Claude Code Changelog',
    description: 'Latest updates and changes to Claude Code',
    feed_url: 'https://anthropics.github.io/claude-code-changelog-rss/claude-code-changelog.xml',
    site_url: 'https://github.com/anthropics/claude-code',
    language: 'en',
    pubDate: new Date(),
    ttl: 60 * 24 // 24 hours
  });

  // Add each version as an RSS item
  for (const versionInfo of versions) {
    const date = getVersionDate(versionInfo.version);
    
    // Convert markdown content to HTML
    const htmlContent = marked(versionInfo.content);
    
    feed.item({
      title: `Claude Code ${versionInfo.version}`,
      description: htmlContent,
      url: `https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#${versionInfo.version.replace(/\./g, '')}`,
      guid: `claude-code-${versionInfo.version}`,
      date: date
    });
  }

  return feed.xml({ indent: true });
}

function main() {
  console.log('Generating RSS feed for Claude Code changelog...');

  // Check if changelog exists
  if (!fs.existsSync(CHANGELOG_PATH)) {
    console.error(`Changelog not found at ${CHANGELOG_PATH}`);
    console.error('Make sure the claude-code repository is cloned in the current directory');
    process.exit(1);
  }

  // Read and parse changelog
  const changelogContent = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const versions = parseChangelog(changelogContent);

  console.log(`Found ${versions.length} versions in changelog`);

  // Generate RSS feed
  const rssXml = generateRSS(versions);

  // Write RSS file
  fs.writeFileSync(OUTPUT_FILE, rssXml);
  console.log(`RSS feed generated: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}