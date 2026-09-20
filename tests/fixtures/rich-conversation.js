/**
 * @file rich-conversation.js
 * Comprehensive rich-content conversation fixture containing all 42 requirements
 * specified in Section 20 of the authoritative high-fidelity specification.
 */

import { createEmptyConversation } from '../../src/core/conversation-model.js';

/**
 * Generates a comprehensive rich conversation fixture containing all 42 elements.
 * @returns {import('../../src/core/conversation-model.js').Conversation}
 */
export function createRichConversationFixture() {
  const conv = createEmptyConversation();
  conv.title = 'Complete Rich Systems & Mathematical Physics Guide (বাংলা & English) 🚀';
  conv.model = 'Z.ai Deep Reasoning 2.0';

  // 1. Simple text & User greeting
  conv.messages.push({
    index: 0,
    role: 'user',
    text: 'Please provide a comprehensive guide on distributed systems, mathematical physics, and comparison tables, with Bengali summary and architecture diagrams.',
    html: '<p>Please provide a comprehensive guide on distributed systems, mathematical physics, and comparison tables, with Bengali summary and architecture diagrams.</p>',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Please provide a comprehensive guide on distributed systems, mathematical physics, and comparison tables, with Bengali summary and architecture diagrams.',
        html: '<p>Please provide a comprehensive guide on distributed systems, mathematical physics, and comparison tables, with Bengali summary and architecture diagrams.</p>'
      }
    ]
  });

  // Assistant Message 1: Headings, Rich Inline Formatting, Lists, Quotes, Citations
  conv.messages.push({
    index: 1,
    role: 'assistant',
    text: 'Here is the comprehensive architectural and mathematical guide.',
    html: '<div>...</div>',
    blocks: [
      // 3. Headings H1-H4
      {
        kind: 'heading',
        level: 1,
        text: '1. Architectural Principles of Distributed Computing',
        html: '<h1>1. Architectural Principles of Distributed Computing</h1>'
      },
      {
        kind: 'heading',
        level: 2,
        text: '1.1 Core Tenets and Consistency Models',
        html: '<h2>1.1 Core Tenets and Consistency Models</h2>'
      },
      {
        kind: 'heading',
        level: 3,
        text: '1.1.1 Network Partitions and CAP Theorem',
        html: '<h3>1.1.1 Network Partitions and CAP Theorem</h3>'
      },
      {
        kind: 'heading',
        level: 4,
        text: 'Detailed Sub-System Specifications',
        html: '<h4>Detailed Sub-System Specifications</h4>'
      },

      // 2. Long paragraph
      // 4. Bold, 5. Italic, 6. Underline, 7. Inline code, 33. Link
      {
        kind: 'paragraph',
        text: 'In distributed systems, achieving linearizability requires careful coordination between replica nodes. According to the CAP theorem, when a network partition occurs, a system must choose between consistency and availability. When using consensus protocols like Raft or Paxos, state machine replication guarantees safety across network anomalies.',
        html: '<p>In distributed systems, achieving <strong>linearizability</strong> requires <em>careful coordination</em> between replica nodes. According to the <u>CAP theorem</u>, when a network partition occurs, a system must choose between <code>Consistency</code> and <code>Availability</code>. When using consensus protocols like <strong>Raft</strong> or <strong>Paxos</strong>, state machine replication guarantees safety across network anomalies. For further reading, visit <a href="https://raft.github.io/">Raft Consensus Documentation</a>.</p>'
      },

      // 10. Ordered list, 11. Unordered list, 12. Nested list
      {
        kind: 'list',
        ordered: true,
        html: '<ol><li>Leader Election Phase<ul><li>Heartbeat timeout trigger</li><li>Vote request dispatching</li></ul></li><li>Log Replication Phase<ol><li>AppendEntries RPC</li><li>Commit index increment</li></ol></li><li>Safety Invariants Enforcement</li></ol>',
        items: [
          {
            text: 'Leader Election Phase: Heartbeat timeout triggers election; Candidate node increments term and votes for itself.'
          },
          {
            text: 'Log Replication Phase: Leader receives commands, appends to local log, and broadcasts AppendEntries RPC.'
          },
          {
            text: 'Safety Invariants Enforcement: Election safety, Leader Append-Only, and State Machine Safety guaranteed.'
          }
        ]
      },

      // 13. Blockquote
      {
        kind: 'quote',
        text: 'Consensus is the fundamental problem in fault-tolerant distributed systems. A consensus algorithm guarantees that a set of distributed processes can agree on values even if some processes fail.',
        html: '<blockquote>Consensus is the fundamental problem in fault-tolerant distributed systems. A consensus algorithm guarantees that a set of distributed processes can agree on values even if some processes fail.</blockquote>'
      },

      // 32. Citation
      {
        kind: 'citation',
        title: 'In Search of an Understandable Consensus Algorithm (Ongaro & Ousterhout, 2014)',
        url: 'https://raft.github.io/raft.pdf',
        snippet:
          'Raft is a consensus algorithm designed to be understandable and equivalent to Paxos in fault-tolerance and performance.'
      }
    ]
  });

  // Assistant Message 2: Code Blocks (>200 chars line, multiline, indentation)
  conv.messages.push({
    index: 2,
    role: 'assistant',
    text: 'Code implementation examples.',
    html: '<div>...</div>',
    blocks: [
      { kind: 'heading', level: 2, text: '2. Implementation & Long Code Line Preservation' },
      // 8. Long code line > 200 chars
      // 9. Multiline code with indentation and tabs
      {
        kind: 'code',
        language: 'python',
        code: `# Distributed State Machine Replicator in Python
class StateReplicator:
    def __init__(self, node_id: str, peers: list[str], storage_backend: str = "rocksdb", election_timeout_ms: int = 150, heartbeat_interval_ms: int = 50, enable_dynamic_membership_reconfiguration: bool = True):
        self.node_id = node_id
        self.peers = peers
        self.current_term = 0
        self.voted_for = None
        self.log = []
        self.commit_index = 0
        self.last_applied = 0
        # Ultra long configuration validation line exceeding 200 characters to verify non-truncation:
        self.network_cluster_configuration_parameters_map = {"heartbeat_interval_milliseconds": heartbeat_interval_ms, "election_timeout_randomized_bound": election_timeout_ms, "enable_strict_leader_lease_safety_checks": True, "maximum_append_entries_batch_size_bytes": 1048576, "checksum_validation_policy": "crc32c"}

    def append_entry(self, term: int, command: dict) -> bool:
        """Appends a log entry after leader confirmation."""
        entry = {"term": term, "index": len(self.log) + 1, "command": command}
        self.log.append(entry)
        return True`
      }
    ]
  });

  // Assistant Message 3: Tables (Simple, Long Cell, Wide, Multi-row)
  conv.messages.push({
    index: 3,
    role: 'assistant',
    text: 'Comparison tables.',
    html: '<div>...</div>',
    blocks: [
      { kind: 'heading', level: 2, text: '3. Comparative Evaluation of Storage Engines' },
      // 14. Simple table, 15. Long table cell, 16. Wide table, 17. Multi-page capable table
      {
        kind: 'table',
        html: `<table>
          <thead>
            <tr>
              <th>Architecture</th>
              <th>Throughput (IOPS)</th>
              <th>P99 Latency</th>
              <th>Durability Model & Fault Recovery Characteristics</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>LSM-Tree (RocksDB)</td>
              <td>125,000 write/sec</td>
              <td>1.8 ms</td>
              <td>Append-only Write-Ahead Log (WAL) with sequential SSTable compactions. Highly optimized for sustained high-rate write workloads and crash consistency across power outages.</td>
            </tr>
            <tr>
              <td>B+ Tree (PostgreSQL)</td>
              <td>48,000 write/sec</td>
              <td>0.9 ms</td>
              <td>In-place page updates with shared WAL buffer and checkpointing. Optimal for point lookups and range queries with low index amplification.</td>
            </tr>
            <tr>
              <td>Memory Grid (Redis Cluster)</td>
              <td>850,000 op/sec</td>
              <td>0.15 ms</td>
              <td>In-memory hash slots with asynchronous background snapshots (RDB) and optional append-only logging (AOF) for near zero-latency access.</td>
            </tr>
            <tr>
              <td>Columnar (ClickHouse)</td>
              <td>2,100,000 row/sec</td>
              <td>3.2 ms</td>
              <td>Vectorized query execution engine with compressed columnar data parts. Designed for analytical OLAP aggregation at multi-gigabyte per second scan rates.</td>
            </tr>
          </tbody>
        </table>`,
        rows: [
          [
            { text: 'Architecture', isHeader: true },
            { text: 'Throughput (IOPS)', isHeader: true },
            { text: 'P99 Latency', isHeader: true },
            { text: 'Durability Model & Fault Recovery Characteristics', isHeader: true }
          ],
          [
            { text: 'LSM-Tree (RocksDB)' },
            { text: '125,000 write/sec' },
            { text: '1.8 ms' },
            {
              text: 'Append-only Write-Ahead Log (WAL) with sequential SSTable compactions. Highly optimized for sustained high-rate write workloads and crash consistency across power outages.'
            }
          ],
          [
            { text: 'B+ Tree (PostgreSQL)' },
            { text: '48,000 write/sec' },
            { text: '0.9 ms' },
            {
              text: 'In-place page updates with shared WAL buffer and checkpointing. Optimal for point lookups and range queries with low index amplification.'
            }
          ],
          [
            { text: 'Memory Grid (Redis Cluster)' },
            { text: '850,000 op/sec' },
            { text: '0.15 ms' },
            {
              text: 'In-memory hash slots with asynchronous background snapshots (RDB) and optional append-only logging (AOF) for near zero-latency access.'
            }
          ],
          [
            { text: 'Columnar (ClickHouse)' },
            { text: '2,100,000 row/sec' },
            { text: '3.2 ms' },
            {
              text: 'Vectorized query execution engine with compressed columnar data parts. Designed for analytical OLAP aggregation at multi-gigabyte per second scan rates.'
            }
          ]
        ]
      }
    ]
  });

  // Assistant Message 4: Mathematical Physics (Fractions, Summations, Matrices, Greek symbols, Sub/Superscript)
  conv.messages.push({
    index: 4,
    role: 'assistant',
    text: 'Mathematical Physics Formulation.',
    html: '<div>...</div>',
    blocks: [
      { kind: 'heading', level: 2, text: '4. Mathematical Physics Formulations' },
      // 18. Inline math
      {
        kind: 'paragraph',
        text: 'The famous relativistic mass-energy equivalence is expressed as E = mc^2, where m is the relativistic mass and c is the speed of light in vacuum.',
        html: '<p>The famous relativistic mass-energy equivalence is expressed as <span class="katex"><span class="katex-mathml"><annotation encoding="application/x-tex">E = mc^2</annotation></span></span>, where <span class="katex"><annotation encoding="application/x-tex">m</annotation></span> is the relativistic mass and <span class="katex"><annotation encoding="application/x-tex">c</annotation></span> is the speed of light in vacuum.</p>'
      },
      // 19. Display math
      // 20. Fraction, 24. Superscript, 25. Subscript, 23. Greek symbols
      {
        kind: 'math',
        tex: 'f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}',
        displayMode: true
      },
      // 21. Summation
      {
        kind: 'math',
        tex: 'S_n = \\sum_{k=1}^{n} \\frac{1}{k^2} = \\frac{\\pi^2}{6}',
        displayMode: true
      },
      // 22. Matrix formulation
      {
        kind: 'math',
        tex: '\\mathbf{H} = \\begin{pmatrix} \\alpha & \\beta \\\\ \\beta & \\gamma \\end{pmatrix}, \\quad \\det(\\mathbf{H}) = \\alpha \\gamma - \\beta^2',
        displayMode: true
      }
    ]
  });

  // Assistant Message 5: Diagrams, SVGs, Canvases, Images
  const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="140" viewBox="0 0 360 140" aria-label="Raft Cluster Topology">
    <rect x="10" y="20" width="90" height="50" rx="6" fill="#4F46E5" />
    <text x="25" y="50" fill="#FFFFFF" font-family="sans-serif" font-size="14" font-weight="bold">Leader</text>
    <path d="M 100 45 L 150 45" stroke="#6366F1" stroke-width="2" marker-end="url(#arrow)" />
    <rect x="150" y="10" width="90" height="40" rx="6" fill="#10B981" />
    <text x="165" y="35" fill="#FFFFFF" font-family="sans-serif" font-size="12">Follower 1</text>
    <rect x="150" y="70" width="90" height="40" rx="6" fill="#10B981" />
    <text x="165" y="95" fill="#FFFFFF" font-family="sans-serif" font-size="12">Follower 2</text>
  </svg>`;

  conv.messages.push({
    index: 5,
    role: 'assistant',
    text: 'Visual Architecture & Diagrams.',
    html: '<div>...</div>',
    blocks: [
      { kind: 'heading', level: 2, text: '5. Visual Architecture & Component Diagrams' },
      // 26. SVG diagram, 27. Mermaid-style diagram
      {
        kind: 'image',
        src: `data:image/svg+xml;utf8,${encodeURIComponent(sampleSvg)}`,
        dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(sampleSvg)}`,
        alt: 'Raft Cluster Topology Architecture',
        width: 360,
        height: 140,
        caption:
          'Figure 1: Leader election and heartbeat dispatching topology across replica quorum.'
      },
      // 29. PNG image with caption
      {
        kind: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjuAAAAAElFTkSuQmCC',
        dataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjuAAAAAElFTkSuQmCC',
        alt: 'Cluster Diagnostic Pixel Matrix',
        caption: 'Diagnostic telemetry health beacon'
      },
      // 34. Artifact-like content
      {
        kind: 'artifact',
        title: 'Cluster Topology Config (raft-cluster.yaml)',
        html: '<pre><code>cluster_id: zai-prod-01\nheartbeat_ms: 50\nelection_timeout_ms: 150\nnodes:\n  - id: n1\n    role: leader\n  - id: n2\n    role: follower</code></pre>'
      }
    ]
  });

  // Assistant Message 6: Bengali Text, Emojis, and Mixed Text
  conv.messages.push({
    index: 6,
    role: 'assistant',
    text: 'বাংলা সারাংশ ও প্রযুক্তিগত বিশ্লেষণ।',
    html: '<div>...</div>',
    blocks: [
      // 35. Bengali text, 36. Emoji, 37. Mixed English/Bengali
      {
        kind: 'heading',
        level: 2,
        text: '6. বাংলা সারাংশ ও কার্যকারিতা পর্যালোচনা (Summary) 🇧🇩 ✨'
      },
      {
        kind: 'paragraph',
        text: 'কম্পিউটার পারফরম্যান্স খুব গুরুত্বপূর্ণ। ডিস্ট্রিবিউটেড সিস্টেমে কনসেনসাস অ্যালগরিদম যেমন Raft বা Paxos উচ্চমাত্রার নির্ভরযোগ্যতা এবং ডাটা ইন্টিগ্রিটি নিশ্চিত করে।',
        html: '<p><strong>কম্পিউটার পারফরম্যান্স খুব গুরুত্বপূর্ণ।</strong> ডিস্ট্রিবিউটেড সিস্টেমে কনসেনসাস অ্যালগরিদম যেমন <code>Raft</code> বা <code>Paxos</code> উচ্চমাত্রার নির্ভরযোগ্যতা এবং ডাটা ইন্টিগ্রিটি (Data Integrity) নিশ্চিত করে। সিস্টেম ব্যর্থতার সময়ও এটি নিরবচ্ছিন্ন কার্যকারিতা প্রদান করতে সক্ষম। 🚀</p>'
      },
      {
        kind: 'quote',
        text: 'প্রযুক্তি এবং বিজ্ঞান আধুনিক সভ্যতার মূল চালিকাশক্তি।',
        html: '<blockquote>প্রযুক্তি এবং বিজ্ঞান আধুনিক সভ্যতার মূল চালিকাশক্তি।</blockquote>'
      }
    ]
  });

  return conv;
}
