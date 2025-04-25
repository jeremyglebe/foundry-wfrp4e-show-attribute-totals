import * as jsonData from '../module.json' assert { type: 'json' };
const moduleId = jsonData.id;

Hooks.once('init', () => {
  console.log(`${moduleId} | Hook: init`);
});

Hooks.on('renderAttributesStage', (attributesStage, init, options) => {
  console.log(`${moduleId} | Hook: renderAttributesStage`);
  // Sum up all attributes from the context
  const { context } = options;
  const rollsSum = Object.values(context.characteristics).reduce((sum, attr) => sum + attr.roll, 0);

  // If the rolls sum is zero, we shouldn't display anything
  if (rollsSum === 0) return;

  // Search for the 'result' div (class) which usually displays the XP earned for random rolls
  const divResultsFooter = document.querySelector('.result');
  if (divResultsFooter) {
    // The footer contains a <div> that is empty - lets remove it
    const emptyDiv = divResultsFooter.querySelector('div');
    if (emptyDiv) {
      emptyDiv.remove();
    }

    // Add a new <div> to display the total attributes
    const spanRollsSum = document.createElement('span');
    spanRollsSum.className = 'rolls-sum';
    spanRollsSum.textContent = `Sum of your characteristic rolls: ${rollsSum}`;
    divResultsFooter.appendChild(spanRollsSum);

    // Add a <div> element to display the expected average sum of rolls
    const expectedAverage = Object.values(context.characteristics).reduce((sum, attr) => {
      const formula = parseDiceFormula(attr.formula);
      if (formula) {
        return sum + (formula.numDice * (formula.dieSize + 1) / 2);
      }
      return sum;
    }, 0);
    const spanExpectedAverage = document.createElement('span');
    spanExpectedAverage.className = 'expected-average';
    spanExpectedAverage.textContent = `If all rolls were average, you'd get: ${expectedAverage.toFixed(2)}`;
    divResultsFooter.appendChild(spanExpectedAverage);

    // Get the total number of dice rolled the entire list of characteristics
    const numDice = Object.values(context.characteristics).reduce((count, attr) => {
      const formula = parseDiceFormula(attr.formula);
      return count + (formula ? formula.numDice : 0);
    }, 0);

    // Die size should be constant but we'll make it the average die size of the rolls
    const dieSize = Object.values(context.characteristics).reduce((sum, attr) => {
      const formula = parseDiceFormula(attr.formula);
      return sum + (formula ? formula.dieSize : 0);
    }, 0) / Object.values(context.characteristics).length;

    // If the rolls sum is greater than the expected average, display the chance of rolling at or above that sum
    if (rollsSum >= expectedAverage) {
      const chanceAtOrAbove = getChanceOfRollingAtOrAbove(rollsSum, numDice, dieSize);
      const spanChanceAtOrAbove = document.createElement('span');
      spanChanceAtOrAbove.className = 'odds';
      spanChanceAtOrAbove.textContent = `Odds of rolling this good: ${chanceAtOrAbove.toFixed(2)}%`;
      divResultsFooter.appendChild(spanChanceAtOrAbove);
    }
    // If the rolls sum is less than the expected average, display the chance of rolling below that sum
    else if (rollsSum < expectedAverage) {
      const chanceBelow = getChanceOfRollingBelow(rollsSum, numDice, dieSize);
      const spanChanceBelow = document.createElement('span');
      spanChanceBelow.className = 'odds';
      spanChanceBelow.textContent = `Odds of rolling this bad: ${chanceBelow.toFixed(2)}%`;
      divResultsFooter.appendChild(spanChanceBelow);
    }

    // Make it so that each <span> in the footer is given equal width, and the text is centered
    const spans = divResultsFooter.querySelectorAll('span');
    const spanWidth = 100 / spans.length; // Calculate width based on number of spans
    spans.forEach(span => {
      span.style.textAlign = 'center';
      span.style.flex = `1 1 ${spanWidth}%`; // Set flex properties
      span.style.boxSizing = 'border-box'; // Ensure padding and border are included in width
    });
  }
  else {
    console.warn(`${moduleId} | No result div found.`);
  }
});

// Simple function to parse xdy+z dice notation
function parseDiceFormula(diceFormula) {
  const match = diceFormula.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  const [, numDice, dieSize, modifier] = match;
  return {
    numDice: parseInt(numDice) || 1,
    dieSize: parseInt(dieSize),
    modifier: modifier ? parseInt(modifier) : 0
  };
}

function getChanceOfRollingAtOrAbove(target, numDice, dieSize) {

  // Formula is Prod( i=1 to numDice of
  //     1/ai * Sum( j=1 to ai of
  //         x^i
  //     )
  // )
  // for dice a1, a2, ..., an where a is the die size
  // Well, the answer is actually the summation of the
  // coefficients (summation of A's in the resulting A1x^B1 + A2x^B2 +...) of the polynomial terms
  // that have an exponent greater than or equal to the target.

  let summationPolynomials = [];

  for (let i = 1; i <= numDice; i++) {

    let sumPolynomial = new X(1, 0);
    for (let j = 1; j <= dieSize; j++) {
      // Add the term x^i to the sum polynomial
      sumPolynomial = (new X(1, j)).add(sumPolynomial);
    }

    console.log('sumPolynomial before multiplication:', sumPolynomial);

    // Multiply the sum polynomial by the summations multiplier 1/ai (ai is constantly dieSize in our use case, since all dice are the same size)
    sumPolynomial = sumPolynomial.map(x => {
      const multiplier = 1 / dieSize;
      return new X(x.coefficient * multiplier, x.exponent);
    });

    console.log('sumPolynomial after multiplication:', sumPolynomial);

    // Now we have an array (polynomial) of X terms representing the sum polynomial for this die
    summationPolynomials.push(sumPolynomial);
  }

  // Remove all constants (terms with exponent 0) from the summation polynomials
  summationPolynomials = summationPolynomials.map(poly => poly.filter(term => term.exponent > 0));

  console.log('summationPolynomials:', summationPolynomials);

  // Now multiply all of the summation polynomials together
  const prodPolynomial = (new X(1, 0)).polynomialMassMultiply(summationPolynomials);

  console.log('prodPolynomial:', prodPolynomial);

  // Finally, the odds of success is the summation of the polynomial's coefficients
  return prodPolynomial.reduce((sum, term) => {
    // If the term's exponent is 0 (constants), we don't add its coefficient
    if (term.exponent === 0) return sum;
    // If the term's exponent is less than the target, we don't add its coefficient
    if (term.exponent < target) return sum;
    // Otherwise, we add the coefficient to the sum
    return sum + term.coefficient;
  }, 0) * 100; // Convert to percentage

}

function getChanceOfRollingBelow(target, numDice, dieSize) {
  // This will just be the complement of the above function
  return 100 - getChanceOfRollingAtOrAbove(target, numDice, dieSize);
}


class X {
  constructor(coefficient, exponent) {
    this.coefficient = coefficient; // Coefficient of the term
    this.exponent = exponent; // Exponent of the term
  }

  toString() {
    return `${this.coefficient}x^${this.exponent}`;
  }

  // Add two X terms together
  add(other) {
    // If the other term is an instance of X
    if (other instanceof X) {
      if (this.exponent === other.exponent) {
        return new X(this.coefficient + other.coefficient, this.exponent);
      } else {
        return [this, other]; // Return an array of terms if exponents don't match
      }
    }
    // If the other term is an array of X terms (presumed to be a polynomial)
    else if (Array.isArray(other)) {
      // Search the array for a term with the same exponent
      const existingTerm = other.find(term => term.exponent === this.exponent);

      if (existingTerm === undefined) {
        // If there is not an existing term with the same exponent, add this term to the array
        other.push(this);
        return other;
      } else {
        // If there is an existing term with the same exponent, add the coefficients
        existingTerm.coefficient += this.coefficient;
        return other;
      }
    }
  }

  // Multiply by a single term (another X instance)
  multiply(other) {
    if (other instanceof X) {
      return new X(this.coefficient * other.coefficient, this.exponent + other.exponent);
    } else {
      throw new Error('Can only multiply by another X instance');
    }
  }

  // Multiply across an array of X terms (a polynomial)
  expand(polynomial) {
    if (!Array.isArray(polynomial)) {
      throw new Error('Can only expand across an array of X terms');
    }
    return polynomial.map(term => this.multiply(term));
  }

  // Static method to multiply two polynomials represented as arrays of X terms
  polynomialMultiply(poly1, poly2) {
    if (!Array.isArray(poly1) || !Array.isArray(poly2)) {
      throw new Error('Both arguments must be arrays of X terms');
    }
    // For each term in the first polynomial, multiply it by each term in the second polynomial
    const result = poly1.flatMap(x1 => {
      return poly2.map(x2 => x1.multiply(x2));
    });
    // Combine like terms in the result
    return result.reduce((acc, term) => {
      const existingTerm = acc.find(t => t.exponent === term.exponent);
      if (existingTerm) {
        existingTerm.coefficient += term.coefficient;
      } else {
        acc.push(term);
      }
      return acc;
    }, []);
  }

  // Method for multiplying an indeterminate number of polynomials (array of polynomials, each represented as an array of X terms)
  polynomialMassMultiply(polynomials) {
    if (!Array.isArray(polynomials) || !polynomials.every(Array.isArray)) {
      throw new Error('Input must be an array of arrays of X terms');
    }
    // Start with the first polynomial
    let result = polynomials[0];
    // Multiply each subsequent polynomial into the result
    for (let i = 1; i < polynomials.length; i++) {
      result = this.polynomialMultiply(result, polynomials[i]);
    }
    return result;
  }
}
