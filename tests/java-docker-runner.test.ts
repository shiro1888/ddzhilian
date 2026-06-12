import { describe, expect, it } from 'vitest'
import {
  detectJavaMainClassName,
  prepareJavaSourceForDocker,
} from '../server/src/code-runner/java-docker-runner'

describe('java docker runner helpers', () => {
  it('uses the public class name as the source file and entry class', () => {
    const prepared = prepareJavaSourceForDocker([
      'import java.util.HashSet;',
      '',
      'public class HashSetDemo {',
      '  public static void main(String[] args) {',
      '    System.out.println("ok");',
      '  }',
      '}',
    ].join('\n'))

    expect(prepared).toEqual({
      ok: true,
      mainClassName: 'HashSetDemo',
      sourceFileName: 'HashSetDemo.java',
    })
  })

  it('detects a non-public class that declares main', () => {
    const source = [
      'class Worker {}',
      'class MainApp {',
      '  public static void main(String[] args) {',
      '    System.out.println("ok");',
      '  }',
      '}',
    ].join('\n')

    expect(detectJavaMainClassName(source)).toBe('MainApp')
  })

  it('rejects package declarations because the runner uses the default package', () => {
    const prepared = prepareJavaSourceForDocker([
      'package demo;',
      'public class Main {',
      '  public static void main(String[] args) {}',
      '}',
    ].join('\n'))

    expect(prepared).toEqual({
      ok: false,
      error: '暂不支持 package 声明，请使用默认包。',
    })
  })
})
