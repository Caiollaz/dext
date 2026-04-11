import { useState } from 'react';
import type { ToolType } from '../../types';
import { Sidebar } from './sidebar';
import { ToolContainer } from './tool-container';
import { Base64Tool } from '../tools/base64-tool';
import { JwtDecoderTool } from '../tools/jwt-decoder-tool';
import { UuidGeneratorTool } from '../tools/uuid-generator-tool';
import { JsonDiffTool } from '../tools/json-diff-tool';
import { HashGeneratorTool } from '../tools/hash-generator-tool';
import { UrlEncoderTool } from '../tools/url-encoder-tool';
import { TimestampConverterTool } from '../tools/timestamp-converter-tool';
import { RegexTesterTool } from '../tools/regex-tester-tool';
import { JsonFormatterTool } from '../tools/json-formatter-tool';
import { HttpRunnerTool } from '../tools/http-runner-tool';
import styles from './layout.module.css';

export function Layout() {
  const [activeTool, setActiveTool] = useState<ToolType>('base64');

  const renderTool = () => {
    switch (activeTool) {
      case 'base64':
        return <Base64Tool />;
      case 'jwt-decoder':
        return <JwtDecoderTool />;
      case 'uuid-generator':
        return <UuidGeneratorTool />;
      case 'json-diff':
        return <JsonDiffTool />;
      case 'hash-generator':
        return <HashGeneratorTool />;
      case 'url-encoder':
        return <UrlEncoderTool />;
      case 'timestamp-converter':
        return <TimestampConverterTool />;
      case 'regex-tester':
        return <RegexTesterTool />;
      case 'json-formatter':
        return <JsonFormatterTool />;
      case 'http-runner':
        return <HttpRunnerTool />;
    }
  };

  return (
    <div className={styles.layout}>
      <Sidebar activeTool={activeTool} onToolSelect={setActiveTool} />
      <main className={styles.content}>
        <ToolContainer tool={activeTool}>{renderTool()}</ToolContainer>
      </main>
    </div>
  );
}
