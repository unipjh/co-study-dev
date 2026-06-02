import assert from 'node:assert/strict'
import { getGateQuestions } from '../src/lib/learningQuestionGate.js'

const unit = {
  id: 'unit_0_2',
  oxQuestions: [
    {
      statement: 'unit-level fallback question',
      answer: 'O',
      explanation: 'fallback',
    },
  ],
  pageOxQuestions: {
    0: [
      {
        statement: 'page 1 scoped question',
        answer: 'X',
        explanation: 'page 1 only',
      },
    ],
    1: [
      {
        statement: 'page 2 scoped question',
        answer: 'O',
        explanation: 'page 2 only',
      },
    ],
  },
}

{
  const questions = getGateQuestions(unit, 0)
  assert.equal(questions.length, 1)
  assert.equal(questions[0].statement, 'page 1 scoped question')
  assert.equal(questions[0].answer, 'X')
}

{
  const questions = getGateQuestions(unit, 2)
  assert.equal(questions.length, 0)
}

{
  const questions = getGateQuestions(unit)
  assert.equal(questions.length, 1)
  assert.equal(questions[0].statement, 'unit-level fallback question')
}

{
  const questions = getGateQuestions({ focusQuestions: ['legacy question'] })
  assert.equal(questions.length, 1)
  assert.equal(questions[0].legacy, true)
}

{
  const questions = getGateQuestions({ focusQuestions: ['legacy question'] }, 0)
  assert.equal(questions.length, 0)
}

console.log('Learning question gate tests passed')
